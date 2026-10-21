import assert from 'node:assert/strict';
import { cleanClientName, getTariffDisplayName } from '../../shared/proposalPresentation';

// Duplicate/version suffixes are removed wherever the client name is printed.
assert.equal(cleanClientName('Farmacia Albania (Copia)'), 'Farmacia Albania');
assert.equal(cleanClientName('Farmacia Albania (copia importada)'), 'Farmacia Albania');
assert.equal(cleanClientName('  Juan Pérez (V2) (C3)  '), 'Juan Pérez');
assert.equal(cleanClientName('Centro (COPIA) Médico'), 'CentroMédico', 'Inner suffixes collapse surrounding spaces, as before');
assert.equal(cleanClientName('Proyecto V2 sin paréntesis'), 'Proyecto V2 sin paréntesis');

// EDE tariff labels.
assert.equal(getTariffDisplayName('EDEESTE', 'bts1 '), 'BTS1 (Residencial Monómica)');
assert.equal(getTariffDisplayName('EDESUR', 'BTS2'), 'BTS2 (Comercial Simple)');
assert.equal(getTariffDisplayName('EDENORTE', 'BTD'), 'BTD (Baja Tensión con Demanda)');
assert.equal(getTariffDisplayName('EDEESTE', 'BTH'), 'BTH (Baja Tensión Horaria)');
assert.equal(getTariffDisplayName('EDEESTE', 'MTD1'), 'MTD1 (Media Tensión con Demanda)');
assert.equal(getTariffDisplayName('EDEESTE', 'MTD2'), 'MTD2 (Media Tensión Demanda Horaria)');
assert.equal(getTariffDisplayName('EDEESTE', 'MTH'), 'MTH (Media Tensión Horaria)');
assert.equal(getTariffDisplayName('EDEESTE', 'RBT-1'), 'BTS1 (Residencial Monómica)', 'CEPM code migrated into an EDE');
assert.equal(getTariffDisplayName('EDEESTE', 'RBT-2'), 'BTD (Baja Tensión con Demanda)');
assert.equal(getTariffDisplayName('EDEESTE', 'VMT1'), 'VMT1');
assert.equal(getTariffDisplayName('EDEESTE', ''), 'BTS2');

// CEPM tariff labels, including EDE codes carried over by migration.
assert.equal(getTariffDisplayName('CEPM', 'BTS1'), 'RBT-1 (Baja Tensión Regular)');
assert.equal(getTariffDisplayName('CEPM', 'BTD'), 'RBT-2 (Baja Tensión con Demanda)');
assert.equal(getTariffDisplayName('CEPM', 'ESTRBT-2'), 'ESTRBT-2 (Demanda Bayahíbe)');
assert.equal(getTariffDisplayName('CEPM', 'MTD2'), 'RMT-1 (Media Tensión con Demanda)');
assert.equal(getTariffDisplayName('CEPM', 'OTRA'), 'OTRA');
assert.equal(getTariffDisplayName('CEPM', ''), '');

console.log('Proposal presentation helpers: client name cleanup and tariff labels passed.');
