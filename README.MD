# WebGL experiments

Playing around with WebGL and HTML5 canvas.

This project needs to be served over http to work locally, as the js makes requests to get assets which will fail due to CORS policy if serving over the file:// protocol. 

Easiest way to do this is to use the node http-server module (assuming node is installed):
`npm i http-server -g`
`http-server -o http://localhost:8080/index.html`
