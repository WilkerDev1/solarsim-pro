import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDatasheetWithGemini, DATASHEET_RESPONSE_SCHEMA } from "../services/geminiDatasheetService";
import { normalizeDatasheetResponse, planDatasheetImport, datasheetTitle } from "../utils/datasheetImport";
import type { GeminiTransport } from "../../shared/geminiTransport";

// Fichas de familia con transporte sintético: cada variante recibe sus valores; los comunes se reparten.
let reply = "{}";
const bodies: any[] = [];
const transport: GeminiTransport = async (_url, body) => {
  bodies.push(structuredClone(body));
  return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: reply }] } }] };
};
const scan = (name: string) =>
  parseDatasheetWithGemini("QQ==", "application/pdf", name, "synthetic-key", undefined, undefined, undefined, transport);

// Esquema: valores comunes de la familia y razón FV/AC.
const props = DATASHEET_RESPONSE_SCHEMA.properties as Record<string, any>;
assert(props.familySpecs, "el esquema admite valores comunes de la familia");
assert(props.variants.items.properties.maxPvPowerPct, "el esquema admite la razón FV/AC en %");
for (const key of ["lengthMm", "widthMm", "heightMm", "batteryVoltageRange"])
  assert(props.variants.items.properties[key] && props.familySpecs.properties[key], key);

// Jinko: familia de 6 variantes.
const jinkoPowers = [625, 630, 635, 640, 645, 650];
const jinkoIsc = [13.8, 13.86, 13.92, 13.98, 14.04, 14.1];
const jinkoImp = [13.15, 13.2, 13.26, 13.32, 13.38, 13.45];
const jinkoEff = [22.36, 22.54, 22.72, 22.89, 23.07, 23.25];
reply = JSON.stringify({
  equipmentType: "panel",
  brand: "Jinko",
  modelSeries: "Tiger Neo JKM625-650N-78HL4-BDV",
  documentTitle: "JKM625-650N-78HL4-BDV-F9-EN",
  familySpecs: { tempCoeff: -0.29, annualDegradation: 0.4, dimensions: "2465×1134×30 mm" },
  variants: jinkoPowers.map((p, i) => ({
    modelCode: `JKM${p}N-78HL4-BDV`,
    displayName: `Módulos Jinko JKM${p}N-78HL4-BDV (${p}W)`,
    powerW: p,
    voc: 55 + i * 0.1,
    vmp: 46 + i * 0.1,
    isc: jinkoIsc[i],
    imp: jinkoImp[i],
    // una variante devuelve la eficiencia como fracción y otra un valor inválido
    efficiencyPct: i === 5 ? 0.2325 : jinkoEff[i],
    ...(i === 2 ? { isc: -3 } : {}),
  })),
});
const jinko = await scan("JKM625-650N-78HL4-BDV-F9-EN.pdf");
assert.equal(jinko.variants.length, 6);
jinko.variants.forEach((v, i) => {
  assert.equal(v.powerW, jinkoPowers[i]);
  assert.equal(v.imp, jinkoImp[i]);
  assert.equal(v.efficiencyPct, jinkoEff[i], "la eficiencia queda en % del catálogo");
  assert.equal(v.tempCoeff, -0.29, "coeficiente común repartido a cada variante");
  assert.equal(v.annualDegradation, 0.4);
  assert.equal(v.dimensions, "2465 x 1134 x 30 mm", "dimensiones en mm con el formato del catálogo");
  if (i !== 2) assert.equal(v.isc, jinkoIsc[i]);
});
assert.equal(jinko.variants[2].isc, undefined, "un valor inválido se descarta");
assert(jinko.warnings?.some((w) => /isc/i.test(w) && /JKM635N/.test(w)), "el descarte deja aviso por campo");
assert.equal(datasheetTitle(jinko), "Jinko Solar Tiger Neo JKM625-650N-78HL4-BDV", "el título es el producto, no el archivo");
const jinkoPlan = planDatasheetImport(
  { ...jinko, variants: jinko.variants.map((v) => ({ ...v, action: "create_new" as const })) },
  [],
);
assert.equal(jinkoPlan.creates.length, 6);
assert.equal(jinkoPlan.creates[5].item.efficiencyPct, 23.25);
assert.equal(jinkoPlan.creates[5].item.dimensions, "2465 x 1134 x 30 mm");

// Un valor propio de la variante prevalece sobre el común.
const override = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  familySpecs: { tempCoeff: -0.29, dimensions: "2000 x 1000 x 30 mm" },
  variants: [{ modelCode: "A", powerW: 500, tempCoeff: -0.3 }, { modelCode: "B", powerW: 510 }],
});
assert.equal(override.variants[0].tempCoeff, -0.3);
assert.equal(override.variants[1].tempCoeff, -0.29);
// Coeficiente en fracción o sin signo se lleva a %/°C negativo.
const coeff = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  variants: [{ modelCode: "A", powerW: 500, tempCoeff: -0.0029 }, { modelCode: "B", powerW: 510, tempCoeff: 0.29 }],
});
assert.equal(coeff.variants[0].tempCoeff, -0.29);
assert.equal(coeff.variants[1].tempCoeff, -0.29);
assert(coeff.warnings?.length, "la corrección de signo se avisa");

// WeCo XTS: inversores 8K/10K/12K.
reply = JSON.stringify({
  equipmentType: "inverter",
  brand: "WeCo",
  modelSeries: "XTS",
  documentTitle: "XTS_8K_10K_12K_datasheet_v3",
  familySpecs: { maxEfficiencyPct: 98.0, mpptCount: 3, lengthMm: 450, widthMm: 846, heightMm: 280 },
  variants: [
    { modelCode: "XTS 8K", displayName: "Inversor WeCo XTS 8K (8.0Kw)", powerKW: 8, maxAcPowerKW: 8.8, maxPvPowerPct: 200, voltageMPPT: "150-500V" },
    { modelCode: "XTS 10K", displayName: "Inversor WeCo XTS 10K (10.0Kw)", powerKW: 10, maxAcPowerKW: 11, maxPvPowerPct: 150 },
    { modelCode: "XTS 12K", displayName: "Inversor WeCo XTS 12K (12.0Kw)", powerKW: 12, maxAcPowerKW: 12, maxPvPowerPct: 150, maxPvPowerKW: 18 },
  ],
});
const weco = await scan("XTS_8K_10K_12K_datasheet_v3.pdf");
assert.deepEqual(weco.variants.map((v) => v.maxAcPowerKW), [8.8, 11, 12]);
assert.deepEqual(weco.variants.map((v) => v.maxPvPowerKW), [16, 15, 18], "200 % / 150 % de la potencia nominal pasan a kW");
for (const v of weco.variants) {
  assert.equal(v.maxEfficiencyPct, 98);
  assert.equal(v.mpptCount, 3);
  assert.equal(v.dimensions, "450 x 846 x 280 mm");
}
assert.equal(datasheetTitle(weco), "WeCo XTS");
assert(!weco.warnings?.some((w) => /descart|inválid/i.test(w)), "sin descartes no hay avisos de descarte");

// El prompt le indica al modelo cómo repartir y convertir.
const prompt = bodies.at(-1).systemInstruction.parts[0].text as string;
for (const needle of ["familySpecs", "maxPvPowerPct", "lengthMm", "modelSeries"])
  assert(prompt.includes(needle), `el prompt menciona ${needle}`);

// Título: nunca vacío ni el nombre del archivo.
assert.equal(datasheetTitle({ brand: "A", modelSeries: "A Serie 1", documentTitle: "x" } as any), "A Serie 1");
assert.equal(datasheetTitle({ brand: "A", modelSeries: "", documentTitle: "Ficha A" } as any), "A Ficha A");
assert.equal(datasheetTitle({ brand: "", modelSeries: "", documentTitle: undefined } as any), "Ficha analizada");

// Revisión: conversiones antes de la FV máxima, coma de miles, cadenas en blanco y precedencia de dimensiones.
const wOnly = normalizeDatasheetResponse({
  equipmentType: "inverter", brand: "QA", modelSeries: "M",
  variants: [
    { modelCode: "M800", powerW: 800, maxPvPowerPct: 150 },
    { modelCode: "M0", powerKW: 5, maxPvPowerPct: 0 },
  ],
});
assert.equal(wOnly.variants[0].powerKW, 0.8);
assert.equal(wOnly.variants[0].maxPvPowerKW, 1.2, "FV máxima se calcula con la potencia convertida de W");
assert.equal(wOnly.variants[1].maxPvPowerKW, undefined);
assert(!wOnly.warnings?.some((w) => /falta la potencia AC/.test(w)), "sin aviso falso de potencia AC");
assert(wOnly.warnings?.some((w) => /M0/.test(w) && /maxPvPowerPct/.test(w) && !/falta/.test(w)), "porcentaje no positivo: aviso propio");

const thousands = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  variants: [
    { modelCode: "A", powerW: 500, dimensions: "2,465 x 1,134 x 30 MM" },
    { modelCode: "B", powerW: 500, dimensions: "246,5 x 113,4 x 3 CM" },
  ],
});
assert.equal(thousands.variants[0].dimensions, "2465 x 1134 x 30 mm", "coma de miles y unidad en mayúsculas");
assert.equal(thousands.variants[1].dimensions, "2465 x 1134 x 30 mm", "coma decimal en cm");

const blank = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  familySpecs: { tempCoeff: "   " },
  variants: [{ modelCode: "A", powerW: 500, isc: "  ", imp: " 13,5 " }],
});
assert.equal(blank.variants[0].isc, undefined, "una cadena en blanco no es 0");
assert.equal(blank.variants[0].tempCoeff, undefined);
assert.equal(blank.variants[0].imp, 13.5, "se recorta antes de leer");
assert(!blank.warnings?.some((w) => /descart|inválid/i.test(w)));

const dimPrecedence = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  familySpecs: { dimensions: "2000 x 1000 x 30 mm" },
  variants: [
    { modelCode: "A", powerW: 500, lengthMm: 2465, widthMm: 1134, heightMm: 30 },
    { modelCode: "B", powerW: 510 },
  ],
});
assert.equal(dimPrecedence.variants[0].dimensions, "2465 x 1134 x 30 mm", "las dimensiones propias de la variante prevalecen");
assert.equal(dimPrecedence.variants[1].dimensions, "2000 x 1000 x 30 mm");

// Respuestas CRUDAS reales de Gemini (fichas públicas Jinko Tiger Neo y WeCo XTS).
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const realJinko = normalizeDatasheetResponse(fixture("datasheet-jinko.json"));
assert.equal(realJinko.variants.length, 6);
for (const v of realJinko.variants) {
  assert.equal(v.dimensions, "2465 x 1134 x 30 mm", "ancho de la variante + largo/alto de la familia");
  assert.equal(v.tempCoeff, -0.29);
  assert.equal(v.annualDegradation, 0.4);
  assert(v.voc && v.vmp);
}
const missingJinko = realJinko.warnings?.find((w) => /La IA no extrajo/.test(w));
assert(missingJinko, "lo que el modelo no devolvió no se pierde en silencio");
for (const label of ["Isc", "Imp", "eficiencia"])
  assert(missingJinko!.includes(label), label);
assert(/complétalo a mano/.test(missingJinko!));
assert(!/Voc|Vmp|dimensiones/i.test(missingJinko!), "solo lo ausente");
assert.equal(realJinko.warnings?.some((w) => /incompletas/.test(w)), false);

const realWeco = normalizeDatasheetResponse(fixture("datasheet-weco.json"));
assert.equal(realWeco.variants.length, 3);
for (const v of realWeco.variants) {
  assert.equal(v.dimensions, "450 x 846 x 280 mm", "medidas combinadas clave a clave con la familia");
  assert.equal(v.vmp, undefined, "la tensión de batería no es el Vmp de un inversor");
  assert.equal(v.voltageV, undefined);
  assert.equal(v.maxChargeCurrentA, undefined);
  assert.equal(v.batteryVoltageRange, "40-60V");
  assert.equal(v.maxEfficiencyPct, 98);
  assert.equal(v.mpptCount, 3);
  assert.equal(v.voltageMPPT, "70-540V");
}
assert.equal(realWeco.warnings?.some((w) => /incompletas/.test(w)), false, "sin aviso de dimensiones incompletas");
const missingWeco = realWeco.warnings?.find((w) => /La IA no extrajo/.test(w));
assert(missingWeco && /AC máxima/.test(missingWeco) && /FV máxima/.test(missingWeco));

// Dimensiones: clave a clave; el texto de la familia completa lo que falta.
const dims = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  familySpecs: { dimensions: "2000 x 1000 x 30 mm", lengthMm: 2000, widthMm: 1000, heightMm: 30 },
  variants: [
    { modelCode: "A", powerW: 500, lengthMm: 2100 },
    { modelCode: "B", powerW: 500 },
  ],
});
assert.equal(dims.variants[0].dimensions, "2100 x 1000 x 30 mm", "la medida de la variante prevalece individualmente");
assert.equal(dims.variants[1].dimensions, "2000 x 1000 x 30 mm");
const dimsPartial = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  variants: [{ modelCode: "A", powerW: 500, lengthMm: 2100 }],
});
assert(dimsPartial.warnings?.some((w) => /incompletas/.test(w)), "avisa solo si sigue incompleto");

// El esquema nombra y describe los campos que el modelo tendía a omitir.
const variantProps = (DATASHEET_RESPONSE_SCHEMA.properties as any).variants.items;
for (const key of ["efficiencyPct", "isc", "imp", "maxAcPowerKW", "maxPvPowerKW", "maxPvPowerPct"]) {
  assert(variantProps.properties[key].description, `${key} tiene descripción`);
  assert(variantProps.required.includes(key), `${key} es obligatorio (null si no está)`);
  assert.equal(variantProps.properties[key].nullable, true);
}
assert(/Max\. AC Output Power|Max\. AC/i.test(variantProps.properties.maxAcPowerKW.description));

console.log("testDatasheetFamilySpecs: OK");
