/**
 * Textos de fábrica de la propuesta. `DEFAULT_DOCUMENT_CUSTOMIZATION` (app) y el Worker los leen de aquí.
 * Hasta 2.6.x las propuestas nuevas copiaban estos valores en sus campos; por eso un campo heredado
 * igual a uno de estos valores no cuenta como personalizado (ver `KNOWN_FACTORY_VALUES`).
 */

export const FACTORY_COMPANY = {
  companyName: 'electsun',
  companySlogan: 'El sol a tu favor',
  companyFooterText: 'Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do',
  companyPhone: '+1 (809) 378-6590',
  companyEmail: 'info@electsun.com.do',
  companyRnc: '',
  companyWebsite: 'electsun.com.do',
  companyInstagram: 'Electsunrd',
} as const;

export const FACTORY_TEXTS = {
  validityNote: 'Precios sujetos a disponibilidad de inventario. Cotización válida por 7 días laborables.',
  panelWarrantyText: '25 Años de Producción Lineal',
  inverterWarrantyText: '5 a 10 Años de Fábrica',
  batteryWarrantyText: '5 a 10 Años (según fabricante)',
  workmanshipWarrantyText: '1 Año en Instalación y Soporte Técnico',
  servicesIncludedText: 'Permisos y Tramitación ante CNE y Distribuidora, Medición Neta, Planos Eléctricos, Instalación Certificada y Puesta en Marcha.',
  aboutUsIntroText: 'En ELECTSUN, transformamos la energía solar en una solución inteligente, sostenible y accesible para todos. Creemos en un futuro más limpio y eficiente, y estamos aquí para hacerlo posible.',
  aboutUsTransitionText: 'Descubre cómo nuestros productos y servicios pueden ayudarte a aprovechar al máximo la energía del sol.',
  whyChooseUsText: 'En ELECTSUN, nuestra misión es brindarte soluciones solares que no solo optimicen tu consumo energético, sino que también te permitan formar parte de la revolución verde del futuro. ¡Haz el cambio hoy y disfruta de los beneficios de una energía limpia y renovable!',
  regulatoryNote: 'La energía generada mensualmente se descontará del consumo tomado de la red pública (EDES) o de la planta eléctrica. Cuando la producción supere el consumo, el excedente se acreditará como descuento en su factura eléctrica.\n\nLa presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.\n\nLos ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.\n\nPara los clientes con tarifas BTS1 y BTS2, el análisis económico considera el cargo por derecho de uso de la red, equivalente al 25 % del valor de la energía excedente exportada, conforme a la normativa vigente. Por esta razón, el sistema se diseña para maximizar el autoconsumo y minimizar la exportación de energía, obteniendo así el mayor beneficio económico posible. Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento de la energía generada.',
  ley5707ObjectivesIntroText: 'La **Ley 57-07 sobre Incentivo al Desarrollo de Fuentes Renovables de Energía** fue promulgada para transformar la matriz energética nacional y acelerar la transición hacia un modelo sostenible y soberano. Sus principales objetivos y beneficios son:',
  techIntroWhatIsText: 'Un sistema fotovoltaico es el conjunto integrado de equipos diseñados para capturar la energía proveniente del sol y transformarla en electricidad utilizable. Su funcionamiento se fundamenta en la capacidad de las celdas fotovoltaicas para convertir la radiación solar directamente en energía eléctrica.',
  techIntroHowItWorksParagraph1: 'La cantidad de energía eléctrica producida está determinada por las horas de radiación solar disponibles, la cantidad e inclinación de los módulos fotovoltaicos instalados, la calidad de los componentes de ingeniería y la potencia nominal del inversor central o microinversores.',
  techIntroHowItWorksParagraph2: 'Las celdas fotovoltaicas absorben la radiación lumínica y generan corriente continua (CC), la cual es procesada instantáneamente por el inversor para convertirla en corriente alterna (CA) sincronizada con la red eléctrica y apta para todo el consumo de la propiedad.',
  projectEngineeringScopeText: 'junto con todos los componentes de ingeniería complementarios (estructuras de montaje en aluminio anodizado de alta resistencia, cableado fotovoltaico resistente a rayos UV, protecciones en CC/CA, interruptores de desconexión y supresores de sobretensión) para garantizar un funcionamiento seguro, eficiente y duradero del sistema.',
} as const;

export type FactoryTextField = keyof typeof FACTORY_TEXTS;

/**
 * Valores que la app escribió de fábrica en campos heredados. Un campo con uno de estos valores
 * se trata como «sin personalizar»: así se muestran los textos dinámicos (nota regulatoria, validez)
 * y desaparece el «Por Defecto» permanente de las propuestas creadas con 2.6.x.
 */
export const KNOWN_FACTORY_VALUES: Partial<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(FACTORY_TEXTS).map(([field, value]) => [field, [value]]),
);
