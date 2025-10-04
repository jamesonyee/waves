function showError(errorText) {
  const errorBox = document.getElementById("error-box");
  const errorTextElement = document.createElement("p");
  errorTextElement.innerText = errorText;
  errorBox.appendChild(errorTextElement);
  console.error(errorText);
}

function toggleFullscreen(element) {
  if (!document.fullscreenElement) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}
async function loadShader(gl, type, url) {
  const response = await fetch(url);
  if (!response.ok) {
    showError(
      `Failed to fetch shader source from ${url}: ${response.statusText}`
    );
    return null;
  }

  const shaderSource = await response.text();
  const shader = gl.createShader(type);

  if (!shader) {
    showError(`Failed to create shader of type ${type}`);
    return null;
  }

  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const shaderType = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    showError(
      `Error compiling ${shaderType} shader from ${url}: ${gl.getShaderInfoLog(
        shader
      )}`
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createGridWithNormals(size, divisions) {
  const halfSize = size / 2;
  const step = size / divisions;
  const vertices = [];
  const normals = [];
  const indices = [];

  for (let j = 0; j <= divisions; j++) {
    for (let i = 0; i <= divisions; i++) {
      const x = -halfSize + i * step;
      const z = -halfSize + j * step;
      vertices.push(x, 0, z);
      normals.push(0, 1, 0);
    }
  }

  for (let j = 0; j < divisions; j++) {
    for (let i = 0; i < divisions; i++) {
      const topLeft = j * (divisions + 1) + i;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + (divisions + 1);
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight);
      indices.push(topRight, bottomLeft, bottomRight);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

//For reading in 3D noise texture
async function readTexture3D(url) {
  // Fetch the binary data from the file
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to load file: ${response.statusText}`);
    return null;
  }

  // Read the response as an ArrayBuffer
  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  // Read the texture dimensions (nums, numt, nump)
  let offset = 0;
  const nums = dataView.getInt32(offset, true);
  offset += 4;
  const numt = dataView.getInt32(offset, true);
  offset += 4;
  const nump = dataView.getInt32(offset, true);
  offset += 4;

  console.log(`Texture size = ${nums} x ${numt} x ${nump}`);

  // Store the dimensions
  const width = nums;
  const height = numt;
  const depth = nump;

  // Read the texture data (assuming RGBA, 4 bytes per pixel)
  const textureSize = 4 * nums * numt * nump;
  const texture = new Uint8Array(buffer, offset, textureSize);

  return {
    width,
    height,
    depth,
    texture,
  };
}

async function initWebGL() {
  const canvas = document.getElementById("glCanvas");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const canvasContainer = document.getElementById("canvas-container");

  if (!canvas) {
    showError("Cannot get canvas reference.");
    return;
  }

  // Initialize WebGL2 context
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    showError("This browser does not support WebGL 2");
    return;
  }

  // Add fullscreen toggle functionality
  fullscreenBtn.addEventListener("click", () =>
    toggleFullscreen(canvasContainer)
  );

  // Resize canvas to match display size
  function resizeCanvas() {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;

      // Update WebGL viewport
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);

  // Ensure dragging stops when the mouse leaves the canvas
  canvas.addEventListener("mouseleave", onMouseUp);

  // Ensure dragging stops if the mouse is released outside the canvas
  document.addEventListener("mouseup", onMouseUp);

  const vertexShader = await loadShader(
    gl,
    gl.VERTEX_SHADER,
    "shaders/waveVertex.glsl"
  );
  const fragmentShader = await loadShader(
    gl,
    gl.FRAGMENT_SHADER,
    "shaders/waveFrag.glsl"
  );

  if (!vertexShader || !fragmentShader) return;

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    showError(`Error linking program: ${gl.getProgramInfoLog(shaderProgram)}`);
    return;
  }

  const gridVertices = createGridWithNormals(100, 100);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, gridVertices.vertices, gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, gridVertices.normals, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridVertices.indices, gl.STATIC_DRAW);

  const positionAttribLocation = gl.getAttribLocation(
    shaderProgram,
    "aVertexPosition"
  );
  const normalAttribLocation = gl.getAttribLocation(
    shaderProgram,
    "aVertexNormal"
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(positionAttribLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionAttribLocation);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.08, 0.08, 0.08, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(shaderProgram);

  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let rotation = { x: 0, y: 0 };

  // Mouse event handlers
  function onMouseDown(event) {
    isDragging = true;
    previousMousePosition = { x: event.clientX, y: event.clientY };
    console.log("Dragging");
  }

  function onMouseMove(event) {
    if (isDragging) {
      const deltaX = event.clientX - previousMousePosition.x;
      const deltaY = event.clientY - previousMousePosition.y;

      // Invert the direction of rotation
      rotation.x -= deltaX * 0.002; // Invert rotation for X-axis
      rotation.y += deltaY * 0.005; // Invert rotation for Y-axis

      previousMousePosition = { x: event.clientX, y: event.clientY };

      // Update the view matrix based on rotation
      updateCameraView();
    }
  }

  function onMouseUp() {
    isDragging = false;
    console.log("not dragging");
  }

  function updateCameraView() {
    const viewMatrix = glMatrix.mat4.create();
    const cameraPosition = [
      200 * Math.sin(rotation.x),
      40 + 200 * Math.sin(rotation.y),
      125 * Math.cos(rotation.x),
    ];

    glMatrix.mat4.lookAt(viewMatrix, cameraPosition, [0, 0, 0], [0, 1, 0]);

    gl.uniformMatrix4fv(
      gl.getUniformLocation(shaderProgram, "uViewMatrix"),
      false,
      viewMatrix
    );

    // Update the normal matrix too, as it's dependent on the view matrix
    const normalMatrix = glMatrix.mat3.create();
    glMatrix.mat3.fromMat4(normalMatrix, viewMatrix);
    glMatrix.mat3.invert(normalMatrix, normalMatrix);
    glMatrix.mat3.transpose(normalMatrix, normalMatrix);

    gl.uniformMatrix3fv(
      gl.getUniformLocation(shaderProgram, "uNormalMatrix"),
      false,
      normalMatrix
    );
  }

  const projectionMatrix = glMatrix.mat4.create();
  glMatrix.mat4.perspective(
    projectionMatrix,
    (45 * Math.PI) / 180,
    canvas.width / canvas.height,
    0.1,
    1000.0
  );
  const viewMatrix = glMatrix.mat4.create();
  glMatrix.mat4.lookAt(viewMatrix, [0, 0, 0], [0, 0, 0], [0, 1, 0]);

  gl.uniformMatrix4fv(
    gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
    false,
    projectionMatrix
  );
  gl.uniformMatrix4fv(
    gl.getUniformLocation(shaderProgram, "uViewMatrix"),
    false,
    viewMatrix
  );

  const normalMatrix = glMatrix.mat3.create();
  glMatrix.mat3.fromMat4(normalMatrix, viewMatrix);
  glMatrix.mat3.invert(normalMatrix, normalMatrix);
  glMatrix.mat3.transpose(normalMatrix, normalMatrix);

  // Pass the normal matrix to the shader
  gl.uniformMatrix3fv(
    gl.getUniformLocation(shaderProgram, "uNormalMatrix"),
    false,
    normalMatrix
  );

  // Read the 3D noise texture
  const noiseTextureData = await readTexture3D("src/noise3d.064.tex");
  if (!noiseTextureData) {
    console.error("Failed to load 3D noise texture");
    return;
  }

  // Create the 3D texture
  const noiseTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, noiseTexture);

  // Upload the 3D noise texture data
  gl.texImage3D(
    gl.TEXTURE_3D, // Target
    0, // Level (mipmap)
    gl.RGBA, // Internal format
    noiseTextureData.width, // Width
    noiseTextureData.height, // Height
    noiseTextureData.depth, // Depth
    0, // Border
    gl.RGBA, // Format of the pixel data
    gl.UNSIGNED_BYTE, // Data type
    noiseTextureData.texture // Pixel data
  );

  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);

  // Bind the texture to a uniform
  const noiseTextureLocation = gl.getUniformLocation(
    shaderProgram,
    "uNoiseTexture"
  );
  gl.uniform1i(noiseTextureLocation, 0); // texture unit 0

  // Use texture unit 0 for our 3D texture
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, noiseTexture);

  const daylightLocation = gl.getUniformLocation(shaderProgram, "uDaylight");
  const timeScaleLocation = gl.getUniformLocation(shaderProgram, "uTimeScale");
  const timerLocation = gl.getUniformLocation(shaderProgram, "Timer");

  const amp0Location = gl.getUniformLocation(shaderProgram, "uAmp0");
  const propAng0Location = gl.getUniformLocation(shaderProgram, "uPropAng0");
  const density0Location = gl.getUniformLocation(shaderProgram, "uDensity0");

  const amp1Location = gl.getUniformLocation(shaderProgram, "uAmp1");
  const propAng1Location = gl.getUniformLocation(shaderProgram, "uPropAng1");
  const density1Location = gl.getUniformLocation(shaderProgram, "uDensity1");

  const NoiseAmpLocation = gl.getUniformLocation(shaderProgram, "uNoiseAmp");
  const NoiseFreqLocation = gl.getUniformLocation(shaderProgram, "uNoiseFreq");

  // Get slider elements
  const daylightSlider = document.getElementById("daylight");
  const timeScaleSlider = document.getElementById("timeScale");

  const amp0Slider = document.getElementById("amp0");
  const propAng0Slider = document.getElementById("propAng0");
  const density0Slider = document.getElementById("density0");

  const amp1Slider = document.getElementById("amp1");
  const propAng1Slider = document.getElementById("propAng1");
  const density1Slider = document.getElementById("density1");

  const noiseAmpSlider = document.getElementById("noiseAmp");
  const noiseFreqSlider = document.getElementById("noiseFreq");

  // Get value display elements
  const daylightValue = document.getElementById("daylightValue");
  const timeScaleValue = document.getElementById("timeScaleValue");

  const amp0Value = document.getElementById("amp0Value");
  const propAng0Value = document.getElementById("propAng0Value");
  const density0Value = document.getElementById("density0Value");

  const amp1Value = document.getElementById("amp1Value");
  const propAng1Value = document.getElementById("propAng1Value");
  const density1Value = document.getElementById("density1Value");

  const noiseAmpValue = document.getElementById("noiseAmpValue");
  const noiseFreqValue = document.getElementById("noiseFreqValue");

  function updateValueDisplay() {
    //daylightValue.textContent = daylightSlider.value;
    timeScaleValue.textContent = timeScaleSlider.value;
    amp0Value.textContent = amp0Slider.value;
    propAng0Value.textContent = propAng0Slider.value;
    density0Value.textContent = density0Slider.value;
    amp1Value.textContent = amp1Slider.value;
    propAng1Value.textContent = propAng1Slider.value;
    density1Value.textContent = density1Slider.value;
    noiseAmpValue.textContent = noiseAmpSlider.value;
    noiseFreqValue.textContent = noiseFreqSlider.value;
  }

  function updateUniforms() {
    gl.uniform1f(daylightLocation, parseFloat(daylightSlider.value));
    console.log("Daylight:", daylightSlider.value);
    gl.uniform1f(timeScaleLocation, parseFloat(timeScaleSlider.value));
    gl.uniform1f(amp0Location, parseFloat(amp0Slider.value));
    gl.uniform1f(propAng0Location, parseFloat(propAng0Slider.value));
    gl.uniform1f(density0Location, parseFloat(density0Slider.value));
    gl.uniform1f(amp1Location, parseFloat(amp1Slider.value));
    gl.uniform1f(propAng1Location, parseFloat(propAng1Slider.value));
    gl.uniform1f(density1Location, parseFloat(density1Slider.value));
    gl.uniform1f(NoiseAmpLocation, parseFloat(noiseAmpSlider.value));
    gl.uniform1f(NoiseFreqLocation, parseFloat(noiseFreqSlider.value));
  }

  // Add event listeners to sliders
  daylightSlider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  timeScaleSlider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  amp0Slider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  propAng0Slider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  density0Slider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  //

  amp1Slider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  propAng1Slider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  density1Slider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  noiseAmpSlider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  noiseFreqSlider.addEventListener("input", () => {
    updateValueDisplay();
    updateUniforms();
  });

  // Set initial values
  updateValueDisplay();
  updateUniforms();

  // Animation loop
  let startTime = Date.now();

  updateCameraView();

  function render() {
    resizeCanvas();
    // Calculate elapsed time
    const currentTime = Date.now();
    const elapsedTime = (currentTime - startTime) / 1000; // in seconds

    //console.log("==currentTime", currentTime);
    //console.log("==elapsedTime", elapsedTime);

    // Set the Timer uniform
    gl.uniform1f(timerLocation, elapsedTime);

    // Use the slider value to scale the wave speed
    gl.uniform1f(timeScaleLocation, parseFloat(timeScaleSlider.value));

    // Clear canvas and draw the grid
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(
      gl.TRIANGLES,
      gridVertices.indices.length,
      gl.UNSIGNED_INT,
      0
    );

    // Request the next frame
    requestAnimationFrame(render);
  }

  // Start the animation loop
  render();
}

try {
  initWebGL();
} catch (e) {
  showError(`Uncaught JS exception: ${e}`);
}