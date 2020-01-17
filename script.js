
const canvas = document.getElementById("canv");
const gl = canvas.getContext("webgl");
const glPrimitiveType = document.getElementById("gl-primitive-type");

const clearVertices = document.getElementById("clear-vertices");

let vertexShaderString = null;
let fragmentShaderString = null;

let vertexShader = null;
let fragmentShader = null;

let shaderProgram = null;

let vertexAttributeLocation = 0;

let offsetUniformLocation = 0;
let scaleUniformLocation = 0;

let colorUniformLocation = 0;

let keys = {};

let m = false;
let mode = 0;
let hold = false;

let mousePos = {
	x: 0,
	y: 0
};

let offset = {
	x: 0.0,
	y: 0.0
};

let scale = {
	x: 1.0,
	y: 1.0
};

let vertices = [];

let squareVerticesBuffer = null;


glPrimitiveType.addEventListener("change", e => {
	mode = glPrimitiveType.selectedIndex;
});

clearVertices.addEventListener("click", e => {
	vertices = [];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
});

window.addEventListener("resize", e => {
	adjustCanvasSize();
});

window.addEventListener("keydown", e => {
	keys[e.key] = true;

	if (e.key == "u") mode = Math.min(mode+1, 6);
	if (e.key == "j") mode = Math.max(mode-1, 0);

	glPrimitiveType.selectedIndex = mode;

	if (e.ctrlKey) hold = true;
});

window.addEventListener("keyup", e => {
	keys[e.key] = false;
	if (!e.ctrlKey) hold = false;
});

canvas.addEventListener("mousedown", e => {
	if (hold) m = true;
	if (!hold) {
		vertices.push((2 * e.clientX / canvas.width - 1) / scale.x - offset.x, -(2 * e.clientY / canvas.height - 1) / scale.y - offset.y);

		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
	}
});

canvas.addEventListener("mouseup", () => {
	if (hold) m = false;
});

canvas.addEventListener("mousemove", e => {
	mousePos.x = e.clientX;
	mousePos.y = e.clientY;
});

Promise.all([
	fetch("/shaders/vertex.shader"),
	fetch("/shaders/fragment.shader")
])
.then(async shaders => {
	adjustCanvasSize();

	initializeWebGL();
	await makeShaders(shaders);
	initBuffers();

	draw();
});

function adjustCanvasSize() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	gl.viewport(0, 0, canvas.width, canvas.height);
}

function initializeWebGL() {
	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL);
}

async function makeShaders(shaders) {
	vertexShaderString = await shaders[0].text();
	fragmentShaderString = await shaders[1].text();

	vertexShader =  gl.createShader(gl.VERTEX_SHADER);
	fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

	gl.shaderSource(vertexShader, vertexShaderString);
	gl.shaderSource(fragmentShader, fragmentShaderString);

	gl.compileShader(vertexShader);
	gl.compileShader(fragmentShader);

	console.log(gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS));
	console.log(gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS));
	console.log(gl.getShaderInfoLog(vertexShader));
	console.log(gl.getShaderInfoLog(fragmentShader));

	shaderProgram = gl.createProgram();
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	console.log(gl.getProgramParameter(shaderProgram, gl.LINK_STATUS));

	gl.useProgram(shaderProgram);
}


function initBuffers() {
	squareVerticesBuffer = gl.createBuffer();

	gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesBuffer);
	// gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

	vertexAttributeLocation = gl.getAttribLocation(shaderProgram, "vertex");
	offsetUniformLocation = gl.getUniformLocation(shaderProgram, "offset");
	scaleUniformLocation = gl.getUniformLocation(shaderProgram, "scale");
	colorUniformLocation = gl.getUniformLocation(shaderProgram, "color");
	gl.enableVertexAttribArray(vertexAttributeLocation);

	gl.vertexAttribPointer(vertexAttributeLocation, 2, gl.FLOAT, false, 0, 0);
}

function draw() {
	if (keys["a"]) offset.x -= 0.01;
	if (keys["d"]) offset.x += 0.01;
	if (keys["w"]) offset.y += 0.01;
	if (keys["s"]) offset.y -= 0.01;

	if (keys["q"]) scale.x = Math.max(0, scale.x - 0.01);
	if (keys["e"]) scale.x += 0.01;

	scale.y = scale.x;

	if (hold) {
		vertices.push((2 * mousePos.x / canvas.width - 1) / scale.x - offset.x, -(2 * mousePos.y / canvas.height - 1) / scale.y - offset.y);

		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
	}

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.useProgram(shaderProgram);

	gl.uniform2f(offsetUniformLocation, offset.x, offset.y);
	gl.uniform2f(scaleUniformLocation, scale.x, scale.y);

	gl.uniform4f(colorUniformLocation, 1.0, 1.0, 1.0, 1.0);
	gl.drawArrays(mode, 0, vertices.length / 2);

	gl.uniform4f(colorUniformLocation, 0.0, 1.0, 0.0, 1.0);
	gl.drawArrays(gl.POINTS, 0, vertices.length / 2);

	requestAnimationFrame(draw);
}