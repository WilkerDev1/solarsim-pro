# SolarSim Pro 2.3.1

Parche de estabilidad para cuentas, organizaciones y publicación web. Conserva los cálculos y documentos existentes.

- Evita perder la sesión ante desconexiones o errores transitorios y corrige carreras durante la renovación del token.
- Conserva borradores al reautenticar en la misma organización y protege el perfil compartido mediante control de versiones.
- Separa el historial de propuestas web por servidor y organización; conserva registros antiguos sin pertenencia demostrada en cuarentena.
- Corrige respuestas tardías del diálogo de publicación, enlaces HTTPS y legibilidad en modo claro.
- Conserva nombres de clientes, consumo y texto personalizado al actualizar la descripción de módulos.
- Actualiza dependencias vulnerables con regresiones; quedan avisos documentados en herramientas de desarrollo.

Linux x64: AppImage, Debian, Arch/pacman y tar.gz. Windows x64: instalador NSIS y portable. Linux incluye firmas GPG; Windows no dispone de Authenticode y puede mostrar avisos de SmartScreen.

La API existente y PostgreSQL no necesitan migraciones adicionales por este parche. El Worker compatible ya está desplegado; instalar este cliente no modifica la base de datos empresarial.
