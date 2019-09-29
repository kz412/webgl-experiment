(function () {
    var gl;
    var shaderProgram;
    var glObjects = [];

    var options = {
        framePerSecond: 60,
        minDisplacement: {
            x: -5,
            y: -5
        },
        maxDisplacement: {
            x: 5,
            y: 5
        },
        lightDirection: vec3.fromValues(0.2, 0.2, 0.2),
        ambientLightColour: vec3.fromValues(0.1, 0.1, 0.1),
        materialSpecular: vec3.fromValues(0.5, 0.5, 0.5),
        acceleration: 0.05,
        maxVelocity: 0.3
    }

    // Util method to quickly compare arrays by element values (see util.js).
    Uint8Array.prototype.equals = arrayEquals(Uint8Array);

    function glObject(modelView, mesh, displacement, pickColor, velocity, rotating, draggable, group) {
        this.id = glObjects.length;
        this.modelView = modelView;
        this.mesh = mesh;
        this.displacement = displacement;
        this.velocity = velocity;
        this.rotation = 0;
        this.pickColor = pickColor;
        this.rotating = rotating;
        this.draggable = draggable;
        this.group = group ? group : [this];
        this.vBuffer = null;

        this.speedUp = function () {            
            if (this.velocity[0] > 0)
                vec3.add(this.velocity, this.velocity, vec3.fromValues(options.acceleration, 0.0, 0.0));
            else
                vec3.add(this.velocity, this.velocity, vec3.fromValues(-options.acceleration, 0.0, 0.0));
        
            if (this.velocity[0] > options.maxVelocity)
                this.velocity = vec3.fromValues(options.maxVelocity, 0.0, 0.0);
            else if (this.velocity[0] < -options.maxVelocity)
                this.velocity = vec3.fromValues(-options.maxVelocity, 0.0, 0.0);
        }

        this.slowDown = function () {            
            if (this.velocity[0] > 0) {
                vec3.add(this.velocity, this.velocity, vec3.fromValues(-options.acceleration, 0.0, 0.0));
                if (this.velocity[0] < 0)
                    this.velocity = vec3.fromValues(0.0, 0.0, 0.0);
            }
            else if (this.velocity[0] < 0) {
                vec3.add(this.velocity, this.velocity, vec3.fromValues(options.acceleration, 0.0, 0.0));
                if (this.velocity[0] > 0)
                    this.velocity = vec3.fromValues(0.0, 0.0, 0.0);            
            }            
        }    
    }        

    var dragState = {
        pickedObject: null,
        mouseDown: false,
        lastPos: null
    }

    window.onload = function () {    
        var canvas = document.getElementById("gl-canvas");    

        // Add our event listeners, to allow interaction with the scene
        // by mouse.
        canvas.addEventListener("mousedown", function (e) {
            // e.which == 3 when right mouse button clicked.
            onMouseDown(e, canvas, e.which == 3)
        });

        canvas.addEventListener("mousemove", function (e) {
            onMouseMove(e, canvas);
        });

        canvas.addEventListener("mouseup", function (e) {
            onMouseUp(e, canvas);
        });

        canvas.addEventListener("mouseover", function (e) {
            onMouseUp(e, canvas);
        });

        canvas.addEventListener("contextmenu", function (e) {
            e.preventDefault();        

            return false;
        });

        var sliderRed = document.getElementById("slider-red");
        sliderRed.value = options.ambientLightColour[0] * 255.0;
        sliderRed.addEventListener("change", function (e) {
            options.ambientLightColour[0] = this.value / 255.0;
        });

        var sliderGreen = document.getElementById("slider-green");
        sliderGreen.value = options.ambientLightColour[1] * 255.0;
        sliderGreen.addEventListener("change", function (e) {
            options.ambientLightColour[1] = this.value / 255.0;
        });

        var sliderBlue = document.getElementById("slider-blue");
        sliderBlue.value = options.ambientLightColour[2] * 255.0;
        sliderBlue.addEventListener("change", function (e) {
            options.ambientLightColour[2] = this.value / 255.0;
        });
 
        // Initialise the canvas for WebGL.
        initGL(canvas);
        initFrameBuffer();
        initShaders();    
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.enable(gl.DEPTH_TEST);    
        gl.disable(gl.DITHER);

        var perspective = mat4.create();
        mat4.perspective(perspective, 45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0);
        gl.perspective = perspective;

        // Load the vertex and normal data for the models we are rendering.
        loadModels();

        gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, gl.perspective);    

        tick();
    };

    function onMouseDown(e, canvas, isRightClick) {
        // Get translatged mouse position. 
        var x = e.clientX;
        var y = canvas.height - (e.clientY - canvas.offsetTop);

        console.log([x, y]); 

        // Find which model (if any) has been picked.
        var pickedObject = getPickedObject(x, y);

        if (pickedObject && !pickedObject.draggable) {
            // We've picked a non-draggable object, so speed it up
            // or slow it down, depending on whether the click was 
            // a right click.
            if (isRightClick) {
                pickedObject.slowDown();
            } else {
                pickedObject.speedUp();
            }        
        }
        else {
            // We've picked a draggable object. Simply store this 
            // object and the current cursor position (in browser
            // coords) in the drag state, animation will be handled
            // by the onMouseMove event handler.
            dragState.pickedObject = pickedObject;
            dragState.lastPos = { x: x, y: y };
            dragState.mouseDown = true;            
        }
    }

    function onMouseMove(e, canvas) {
        // Only do anything if the mouse is currently down (i.e. the 
        // user is dragging the mouse, and we have a currently picked 
        // object
        if (!dragState.mouseDown || !dragState.pickedObject)
            return;

        // Get mouse position
        var x = e.clientX;
        var y = canvas.height - (e.clientY - canvas.offsetTop);
    
        for (var i = 0; i < dragState.pickedObject.group.length; i++) {            
            var glObj = dragState.pickedObject.group[i];
            var diff = { x: x - dragState.lastPos.x, y: y - dragState.lastPos.y };            
            vec3.add(glObj.displacement, glObj.displacement, vec3.fromValues(0, (diff.y * 10) / canvas.height, 0));
        }

        dragState.lastPos = { x: x, y: y };    
    }

    function onMouseUp(e, canvas) {
        // Finished clicking or dragging, clear the drag state.
        dragState.mouseDown = false;
        dragState.pickedObject = null;
    }

    function getPickedObject(x, y) {
        // This relies on loadModels() assigning a unique picking 
        // colour to each object in the scene.

        // Render the all the objects to a frame buffer.
        gl.bindFramebuffer(gl.FRAMEBUFFER, gl.framebuffer);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawObjects(true);

        // Get color in frame buffer at mouse location.
        var color = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color);

        var ret = null;    
    
        // Fail fast if the colour is black (background).
        if (!color.equals([0, 0, 0, 255])) {
            // Otherwise loop through our collection of objects 
            // in the scene and check whether their picking colour
            // matches the colour that was picked above.
            for (var i = 0; i < glObjects.length; i++) {
                var glObject = glObjects[i];
                if (color.equals(glObject.pickColor)) {
                    ret = glObject;
                    break;
                }
            }        
        }

        // Unbind the frame buffer.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        // Return the picked object (null if nothing picked).
        return ret;
    }

    function loadModels() {
        var modelView, displacement, glObj, pickColour, velocity, mesh, group;
    
        // Load our first monkey.
        group = [];
        mesh = loadObjFile("./assets/monkey.obj");
        modelView = mat4.create();
        displacement = vec3.fromValues(0.0, 3.0, -15.0);    
        pickColour = [0, 0, 255, 255];
        velocity = vec3.fromValues(1.0 / options.framePerSecond, 0.0, 0.0); // 1 unit / second.
        glObj = new glObject(modelView, mesh, displacement, pickColour, velocity, true, false, group);
        glObjects.push(glObj);
        group.push(glObj);

        // Load our first two cones
        mesh = loadObjFile("./assets/cone.obj");
        modelView = mat4.create();
        displacement = vec3.fromValues(options.minDisplacement.x, 3.0, -15.0);
        pickColour = [0, 255, 0, 255];
        velocity = vec3.fromValues(0, 0, 0);
        glObj = new glObject(modelView, mesh, displacement, pickColour, velocity, false, true, group);    
        glObjects.push(glObj);
        group.push(glObj);

        modelView = mat4.create();    
        displacement = vec3.fromValues(options.maxDisplacement.x, 3.0, -15.0);
        pickColour = [0, 255, 255, 255]
        velocity = vec3.fromValues(0, 0, 0);
        glObj = new glObject(modelView, mesh, displacement, pickColour, velocity, false, true, group);
        glObj.rotation = 180;
        glObjects.push(glObj);
        group.push(glObj);
        

        // Load our second monkey.
        group = [];
        mesh = loadObjFile("./assets/monkey.obj");
        modelView = mat4.create();
        displacement = vec3.fromValues(0.0, 0.0, -10.0);    
        pickColour = [255, 0, 0, 255];
        velocity = vec3.fromValues(-1.0 / options.framePerSecond, 0.0, 0.0); // 1 unit / second.
        glObj = new glObject(modelView, mesh, displacement, pickColour, velocity, true, false, group);
        glObjects.push(glObj);
        group.push(glObj);

        // Load our second set of cones
        mesh = loadObjFile("./assets/cone.obj");
        modelView = mat4.create();
        displacement = vec3.fromValues(options.minDisplacement.x, 0.0, -10.0);
        pickColour = [255, 0, 255, 255];
        velocity = vec3.fromValues(0, 0, 0);
        glObj = new glObject(modelView, mesh, displacement, pickColour, velocity, false, true, group);
        glObjects.push(glObj);
        group.push(glObj);

        modelView = mat4.create();
        displacement = vec3.fromValues(options.maxDisplacement.x, 0.0, -10.0);
        pickColour = [255, 255, 0, 255]
        velocity = vec3.fromValues(0, 0, 0);
        glObj = new glObject(modelView, mesh, displacement, pickColour, velocity, false, true, group);
        glObj.rotation = 180;
        glObjects.push(glObj);
        group.push(glObj);        
    }


    var vBuffer;
    function drawScene() {
        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
        gl.clear(gl.COLOR_BUFFER_BIT);

        drawObjects(false);
    }

    function drawObjects(offscreen) {
        for (i = 0; i < glObjects.length; i++) {
            var glObject = glObjects[i];

            // If we haven't created a vertex buffer for this object, do so now,
            // storing the buffer's location against the object.
            if (!glObject.vBuffer) {
                glObject.vBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, glObject.vBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, glObject.mesh.vertices, gl.STATIC_DRAW);
            } else {
                // Otherwise simply bind the buffer previously created for this obj.
                gl.bindBuffer(gl.ARRAY_BUFFER, glObject.vBuffer);
            }

            // Create a rotation matrix, to rotate our model around the Y axis
            // by the current value of it's rotation attribute (stored in degrees).
            var rotation = mat4.create();
            mat4.rotateY(rotation, rotation, degToRad(glObject.rotation));

            // Create our translation matrix, from the displacement vector stored
            // against our object.
            var translation = mat4.create();
            mat4.translate(translation, translation, glObject.displacement);

            // Create our normal matrix.
            var normalMatrix = mat3.create();
            mat3.normalFromMat4(normalMatrix, glObject.modelView);

            // Setup our shader uniforms.
            gl.uniformMatrix3fv(shaderProgram.normalMatrixUniform, false, normalMatrix);
            gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, glObject.modelView);
            gl.uniformMatrix4fv(shaderProgram.mvRotation, false, rotation);
            gl.uniformMatrix4fv(shaderProgram.mvTranslation, false, translation);
            gl.uniform4fv(shaderProgram.vColor, glObject.pickColor);
            gl.uniform1i(shaderProgram.uOffscreen, offscreen);

            gl.uniform3fv(shaderProgram.directionalLightUniform, options.lightDirection);
            gl.uniform3fv(shaderProgram.ambientLightColour, options.ambientLightColour);
            gl.uniform3fv(shaderProgram.materialSpecularUniform, options.materialSpecular);
            gl.uniform1f(shaderProgram.materialDiffuseUniform, glObject.mesh.material.diffuse);
            gl.uniform1f(shaderProgram.shininessUniform, glObject.mesh.material.shininess);

            // Setup shader attributes.
            gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
            gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);
            gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, 3, gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 6, 0);
            gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, 3, gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 6, Float32Array.BYTES_PER_ELEMENT * 3);

            // Draw the bound buffer.
            gl.drawArrays(gl.TRIANGLES, 0, glObject.mesh.vertexCount);
        }
    }

    function initFrameBuffer() {
        gl.enable(gl.CULL_FACE);
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1024, 0, gl.RGBA,
        gl.UNSIGNED_BYTE, null);
        gl.generateMipmap(gl.TEXTURE_2D);

        // Allocate a framebuffer object
        var framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebuffer = framebuffer;

        // Attach color buffer
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, texture, 0);

        // Check for completeness
        var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.log('Framebuffer Not Complete');
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function tick() {
        setTimeout(function () {
            requestAnimationFrame(tick);
            drawScene();
            animate();
        }, 1000 / options.framePerSecond);
    }

    function degToRad(degrees) {
        return degrees * Math.PI / 180;
    }

    var lastTime = 0;

    function animate() {
        var timeNow = new Date().getTime();
        if (lastTime != 0) {
            var elapsed = timeNow - lastTime;

            for (i = 0; i < glObjects.length; i++) {
                var glObject = glObjects[i];
                if (glObject.rotating) {
                    // Rotate our object at a rate of 90 degrees / second.
                    glObject.rotation += (90 * elapsed) / 1000;
                    if (glObject.rotation > 360)
                        glObject.rotation -= 360;
                }

                vec3.add(glObject.displacement, glObject.displacement, glObject.velocity);
                // If our object has reached the boundaries of its movement, reverse its direction
                // (scale its velocity vector by -1).
                if (glObject.displacement[0] > options.maxDisplacement.x                 
                    || glObject.displacement[0] < options.minDisplacement.x)                
                    vec3.scale(glObject.velocity, glObject.velocity, -1);            
            }
        }
        lastTime = timeNow;
    }

    function loadMeshData(string) {
        var lines = string.split("\n");
        var positions = [];
        var normals = [];
        var vertices = [];
        for (var i = 0 ; i < lines.length ; i++) {
            var parts = lines[i].trimRight().split(' ');
            if (parts.length > 0) {
                switch (parts[0]) {
                    case 'v':
                        positions.push(
                            vec3.fromValues(
                            parseFloat(parts[1]),
                            parseFloat(parts[2]),
                            parseFloat(parts[3])
                        ));
                        break;
                    case 'vn':
                        normals.push(
                            vec3.fromValues(
                            parseFloat(parts[1]),
                            parseFloat(parts[2]),
                            parseFloat(parts[3])
                        ));
                        break;
                    case 'f': {
                        var f1 = parts[1].split('/');
                        var f2 = parts[2].split('/');
                        var f3 = parts[3].split('/');
                        Array.prototype.push.apply(
                            vertices, positions[parseInt(f1[0]) - 1]);
                        Array.prototype.push.apply(
                            vertices, normals[parseInt(f1[2]) - 1]);
                        Array.prototype.push.apply(
                            vertices, positions[parseInt(f2[0]) - 1]);
                        Array.prototype.push.apply(
                            vertices, normals[parseInt(f2[2]) - 1]);
                        Array.prototype.push.apply(
                            vertices, positions[parseInt(f3[0]) - 1]);
                        Array.prototype.push.apply(
                            vertices, normals[parseInt(f3[2]) - 1]);
                        break;
                    }
                }
            }
        }
        return {
            primitiveType: 'TRIANGLES',
            vertices: new Float32Array(vertices),
            vertexCount: vertices.length / 6,
            material: { ambient: 0.2, diffuse: 0.5, shininess: 10.0 }
        };
    }

    function initGL(canvas) {
        try {
            gl = (canvas.getContext("experimental-webgl") || canvas.getContext("webgl"));
            gl.viewportWidth = 1024;
            gl.viewportHeight = 768;
        } catch (e) {
            console.log(e);
        }
        if (!gl) {
            alert("Could not initialise WebGL, sorry :-(");
        }
    }

    function getShader(gl, id) {
        var shaderScript = document.getElementById(id);
        if (!shaderScript) {
            return null;
        }

        var str = "";
        var k = shaderScript.firstChild;
        while (k) {
            if (k.nodeType == 3) {
                str += k.textContent;
            }
            k = k.nextSibling;
        }

        var shader;
        if (shaderScript.type == "x-shader/x-fragment") {
            shader = gl.createShader(gl.FRAGMENT_SHADER);
        } else if (shaderScript.type == "x-shader/x-vertex") {
            shader = gl.createShader(gl.VERTEX_SHADER);
        } else {
            return null;
        }

        gl.shaderSource(shader, str);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    function initShaders() {
        var fragmentShader = getShader(gl, "shader-fs");
        var vertexShader = getShader(gl, "shader-vs");

        shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            alert("Could not initialise shaders");
        }

        gl.useProgram(shaderProgram);

        shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "vPosition");
        shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "vNormal");

        shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
        shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
        shaderProgram.mvRotation = gl.getUniformLocation(shaderProgram, "uMVRotation");
        shaderProgram.mvTranslation = gl.getUniformLocation(shaderProgram, "uMVTranslation");
        shaderProgram.vColor = gl.getUniformLocation(shaderProgram, "uvColor");
        shaderProgram.uOffscreen = gl.getUniformLocation(shaderProgram, "uOffscreen");
        shaderProgram.normalMatrixUniform = gl.getUniformLocation(shaderProgram, "uNormalMatrix");
        shaderProgram.directionalLightUniform = gl.getUniformLocation(shaderProgram, "uDirectionalLight");
        shaderProgram.ambientLightColour = gl.getUniformLocation(shaderProgram, "uAmbientLightColour");
        shaderProgram.materialSpecularUniform = gl.getUniformLocation(shaderProgram, "uMaterialSpecular");
        shaderProgram.materialDiffuseUniform = gl.getUniformLocation(shaderProgram, "uMaterialDiffuse");
        shaderProgram.shininessUniform = gl.getUniformLocation(shaderProgram, "uShininess");
    }

    function loadObjFile(url) {
        var req = new XMLHttpRequest();
        req.open("GET", url, false);
        req.send();

        return loadMeshData(req.responseText);
    }
}) ();


