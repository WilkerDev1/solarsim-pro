/** Display rules shared by the PDF, simulator and the share-viewer worker. */

/** Removes duplicate/version suffixes such as "(Copia)" or "(V2)" from a client name. */
export function cleanClientName(name: string): string {
  return name.replace(/\s*\((?:Copia|Copia Importada|COPIA|V\d+|C\d+)\)\s*/gi, '').trim();
}

/** Human label for a tariff code; CEPM uses its own RBT/RMT schedule. */
export function getTariffDisplayName(distributor: string, tariffCode: string): string {
  const code = (tariffCode || '').toUpperCase().trim();

  if (distributor === 'CEPM') {
    if (code === 'RBT-1' || code === 'BTS1' || code === 'BTS2') return 'RBT-1 (Baja Tensión Regular)';
    if (code === 'RBT-2' || code === 'BTD') return 'RBT-2 (Baja Tensión con Demanda)';
    if (code === 'ESTRBT-2') return 'ESTRBT-2 (Demanda Bayahíbe)';
    if (code === 'RMT-1' || code === 'MTD1' || code === 'MTD2') return 'RMT-1 (Media Tensión con Demanda)';
    return code;
  }

  // EDEs
  if (code === 'BTS1') return 'BTS1 (Residencial Monómica)';
  if (code === 'BTS2') return 'BTS2 (Comercial Simple)';
  if (code === 'BTD') return 'BTD (Baja Tensión con Demanda)';
  if (code === 'BTH') return 'BTH (Baja Tensión Horaria)';
  if (code === 'MTD1') return 'MTD1 (Media Tensión con Demanda)';
  if (code === 'MTD2') return 'MTD2 (Media Tensión Demanda Horaria)';
  if (code === 'MTH') return 'MTH (Media Tensión Horaria)';

  // Si tiene código CEPM en una EDE por migración
  if (code === 'RBT-1') return 'BTS1 (Residencial Monómica)';
  if (code === 'RBT-2') return 'BTD (Baja Tensión con Demanda)';

  return code || 'BTS2';
}
