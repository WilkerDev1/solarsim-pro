# SolarSim Pro 2.9.4

Versión de corrección. El botón Detener de los asistentes vuelve a detener la respuesta, y una propuesta enlazada se puede sacar de su grupo arrastrándola fuera. La API solo cambia de número de versión: no hay migración nueva y la versión mínima del cliente sigue en 2.9.0.

## Asistentes

- **Detener ya detiene.** Al pulsar Detener, el mismo clic volvía a enviar la consulta: la respuesta parecía no parar y en la conversación aparecían mensajes repetidos («Analizar los documentos adjuntos») con el mismo archivo adjunto. Ahora Detener cancela la respuesta y no envía nada más. Afecta al asistente de propuestas y al asistente general. Esc sigue deteniendo igual que antes.

## Propuestas enlazadas

- **Desenlazar arrastrando fuera.** Una propuesta enlazada bajo otra se desenlaza al arrastrarla y soltarla en un espacio vacío del panel de propuestas, como si se sacara de una carpeta. Mientras se arrastra sobre un hueco aparece el aviso «Soltar para desenlazar «…»». Si tenía propuestas enlazadas debajo, se van con ella. Soltarla sobre sí misma, sobre otra propuesta o sobre una carpeta no la desenlaza. Funciona en la vista de tarjetas y en la de lista.

## Despliegue

- **API:** solo cambia el número de versión. Sin migración. La variable de entorno `MIN_CLIENT_VERSION` del despliegue no cambia y sigue en 2.9.0.
- **Visor web (Worker)** y **MCP remoto:** solo cambia el número de versión; redesplegarlos es opcional.
- **Cliente:** publicar el instalador 2.9.4 con el flujo habitual.
