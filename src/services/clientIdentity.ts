import { version } from '../../package.json';
import { CLIENT_HEADER, formatClientHeader } from '../../shared/clientVersion';

/** Identidad que el escritorio presenta a la API (`X-SolarSim-Client`); la versión sale de package.json en la compilación. */
export const CLIENT_NAME = 'desktop';
export const CLIENT_VERSION: string = version;
export const CLIENT_IDENTITY_HEADER = CLIENT_HEADER;
export const CLIENT_IDENTITY_VALUE = formatClientHeader(CLIENT_NAME, CLIENT_VERSION);
