import { version } from '../package.json';
import { CLIENT_HEADER, formatClientHeader } from '../../../shared/clientVersion';

/** Identidad del Worker ante la API (`X-SolarSim-Client: share-viewer/<versión de package.json>`). */
export const CLIENT_IDENTITY_HEADER = CLIENT_HEADER;
export const CLIENT_IDENTITY_VALUE = formatClientHeader('share-viewer', version);
