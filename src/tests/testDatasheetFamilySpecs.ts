import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDatasheetWithGemini, DATASHEET_RESPONSE_SCHEMA } from "../services/geminiDatasheetService";
import { normalizeDatasheetResponse, planDatasheetImport, datasheetTitle, estimateMaxPvPowerKW, refreshMaxPvEstimate } from "../utils/datasheetImport";
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

// Estimación opcional de la FV máxima cuando la ficha no la publica (Solis S5-GC50K/60K).
const solis = normalizeDatasheetResponse(fixture("datasheet-solis-s5-gc.json"));
assert.equal(solis.variants[0].maxPvPowerKW, undefined, "nunca se aplica sola");
assert.equal(solis.variants[0].maxPvPowerEstimateKW, 65, "min(5×32×600 = 96, 1.3×50 = 65)");
assert.equal(solis.variants[1].maxPvPowerEstimateKW, 78, "min(6×32×600 = 115.2, 1.3×60 = 78)");
assert.equal(solis.variants[0].maxAcPowerKW, 55);
for (const v of solis.variants) {
  assert.equal(v.maxEfficiencyPct, 98.7);
  assert.equal(v.voltageMPPT, "180-1000V");
  assert.equal(v.dimensions, "691 x 578 x 338 mm");
  assert.equal(v.weightKg, 53.7);
}
assert(!solis.warnings?.some((w) => /FV máxima/.test(w)), "con estimación disponible no se pide el dato a mano");
assert.equal(estimateMaxPvPowerKW({ powerKW: 50, mpptCount: 5, mpptMaxCurrentA: 32, dcRatedVoltageV: 600 }), 65);
// Limitada por la corriente/tensión de entrada: 2×10 A×400 V = 8 kW < 1.3×10.
assert.equal(estimateMaxPvPowerKW({ powerKW: 10, mpptCount: 2, mpptMaxCurrentA: 10, dcRatedVoltageV: 400 }), 8);
for (const missing of ["powerKW", "mpptCount", "mpptMaxCurrentA", "dcRatedVoltageV"]) {
  const input: any = { powerKW: 50, mpptCount: 5, mpptMaxCurrentA: 32, dcRatedVoltageV: 600 };
  delete input[missing];
  assert.equal(estimateMaxPvPowerKW(input), undefined, `sin ${missing} no hay estimación`);
}
// Si la ficha publica la FV máxima (kW o %), se usa y no se ofrece estimación.
const published = normalizeDatasheetResponse({
  equipmentType: "inverter", brand: "QA", modelSeries: "S",
  variants: [
    { modelCode: "KW", powerKW: 50, maxPvPowerKW: 75, mpptCount: 5, mpptMaxCurrentA: 32, dcRatedVoltageV: 600 },
    { modelCode: "PCT", powerKW: 50, maxPvPowerPct: 150, mpptCount: 5, mpptMaxCurrentA: 32, dcRatedVoltageV: 600 },
  ],
});
assert.equal(published.variants[0].maxPvPowerKW, 75);
assert.equal(published.variants[1].maxPvPowerKW, 75);
for (const v of published.variants) assert.equal(v.maxPvPowerEstimateKW, undefined);
// Aceptar la estimación guarda el valor con su procedencia; un valor de la ficha la borra.
const accepted = { ...solis.variants[0], maxPvPowerKW: 65, maxPvPowerSource: "estimated" as const, action: "create_new" as const };
const estPlan = planDatasheetImport({ ...solis, variants: [accepted] }, []);
assert.equal(estPlan.creates[0].item.maxPvPowerKW, 65);
assert.equal(estPlan.creates[0].item.maxPvPowerSource, "estimated");
assert.equal((estPlan.creates[0].item as any).maxPvPowerEstimateKW, undefined, "los datos auxiliares no llegan al catálogo");
assert.equal((estPlan.creates[0].item as any).mpptMaxCurrentA, undefined);
const rejected = planDatasheetImport({ ...solis, variants: [{ ...solis.variants[0], action: "create_new" as const }] }, []);
assert.equal(rejected.creates[0].item.maxPvPowerKW, undefined);
assert.equal(rejected.creates[0].item.maxPvPowerSource, undefined);
const fromSheet = planDatasheetImport({ ...published, variants: [{ ...published.variants[0], action: "create_new" as const }] }, []);
assert.equal(fromSheet.creates[0].item.maxPvPowerSource, undefined);
// El esquema pide los datos de entrada DC.
for (const key of ["mpptMaxCurrentA", "dcRatedVoltageV"])
  assert(variantProps.properties[key]?.description, key);

// Revisión 3: la estimación se recalcula al editar en el diálogo.
const base = solis.variants[0]; // 50 kW, 5 MPPT, 32 A, 600 V → 65 kW
const asEstimated = { ...base, maxPvPowerKW: 65, maxPvPowerSource: "estimated" as const };
const lowerAc = refreshMaxPvEstimate({ ...asEstimated, powerKW: 40 }, "inverter");
assert.equal(lowerAc.maxPvPowerEstimateKW, 52, "1.3 × 40");
assert.equal(lowerAc.maxPvPowerKW, 52, "una estimación aceptada sigue a la AC corregida");
assert.equal(lowerAc.maxPvPowerSource, "estimated");
const fewerMppt = refreshMaxPvEstimate({ ...asEstimated, mpptCount: 2 }, "inverter");
assert.equal(fewerMppt.maxPvPowerKW, 38.4, "2×32×600");
const cleared = refreshMaxPvEstimate({ ...asEstimated, mpptCount: undefined }, "inverter");
assert.equal(cleared.maxPvPowerEstimateKW, undefined);
assert.equal(cleared.maxPvPowerKW, undefined, "deja de poder estimarse: se limpia");
assert.equal(cleared.maxPvPowerSource, undefined);
const completed = refreshMaxPvEstimate({ ...base, mpptCount: undefined, maxPvPowerEstimateKW: undefined }, "inverter");
assert.equal(completed.maxPvPowerEstimateKW, undefined);
const filledIn = refreshMaxPvEstimate({ ...completed, mpptCount: 5 }, "inverter");
assert.equal(filledIn.maxPvPowerEstimateKW, 65, "completar un dato que faltaba ofrece la estimación");
assert.equal(filledIn.maxPvPowerKW, undefined, "ofrecida, nunca aplicada sola");
const manual = refreshMaxPvEstimate({ ...base, powerKW: 40, maxPvPowerKW: 70 }, "inverter");
assert.equal(manual.maxPvPowerKW, 70, "un valor manual no se toca");
assert.equal(manual.maxPvPowerSource, undefined);
const publishedAfter = refreshMaxPvEstimate({ ...published.variants[0], mpptCount: 4 }, "inverter");
assert.equal(publishedAfter.maxPvPowerEstimateKW, undefined, "lo publicado en la ficha nunca ofrece estimación");
assert.equal(publishedAfter.maxPvPowerKW, 75);
assert.equal(refreshMaxPvEstimate({ ...base, powerKW: 40 }, "panel").maxPvPowerEstimateKW, base.maxPvPowerEstimateKW, "solo inversores");
// Corriente y tensión DC editables en el diálogo.
assert.equal(refreshMaxPvEstimate({ ...base, mpptMaxCurrentA: 16 }, "inverter").maxPvPowerEstimateKW, 48, "5×16×600");

// Revisión 3: esquema anulable y obligatorio para las entradas DC.
for (const key of ["mpptMaxCurrentA", "dcRatedVoltageV"]) {
  assert.equal(variantProps.properties[key].nullable, true, `${key} anulable`);
  assert(variantProps.required.includes(key));
}

// Revisión 3: dimensiones con 0 o parciales.
const zeroDims = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  variants: [{ modelCode: "Z", powerW: 500, dimensions: "0 x 1134 x 30 mm" }],
});
assert.equal(zeroDims.variants[0].dimensions, undefined, "una medida 0 no es válida");
const partialDims = normalizeDatasheetResponse({
  equipmentType: "panel", brand: "QA", modelSeries: "S",
  familySpecs: { dimensions: "2000 x 1000 x 30 mm" },
  variants: [
    { modelCode: "P", powerW: 500, dimensions: "2465 x 1134 mm" },
    { modelCode: "Q", powerW: 500, dimensions: "2465 x 1134 mm", lengthMm: 2465, widthMm: 1134, heightMm: 30 },
    { modelCode: "R", powerW: 500, dimensions: "n/d" },
  ],
});
assert.equal(partialDims.variants[0].dimensions, undefined, "no hereda en silencio las de la familia");
assert(partialDims.warnings?.some((w) => /Dimensiones incompletas de P/.test(w)));
assert.equal(partialDims.variants[1].dimensions, "2465 x 1134 x 30 mm", "las medidas propias completan el texto parcial");
assert.equal(partialDims.variants[2].dimensions, "2000 x 1000 x 30 mm", "sin dígitos equivale a ausente");

console.log("testDatasheetFamilySpecs: OK");
