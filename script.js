
const canvas = document.getElementById("canv");
const canvas_info = document.getElementById("canv_info");

const gl = canvas.getContext("webgl", { antialias: false });
const ctx = canvas_info.getContext("2d");
const glPrimitiveType = document.getElementById("gl-primitive-type");

const clearVertices = document.getElementById("clear-vertices");
const toolPan = document.getElementById("tool-pan");
const toolSelect = document.getElementById("tool-select");
const toolDraw = document.getElementById("tool-draw");
const toolMove = document.getElementById("tool-move");
const snapToGridCheckbox = document.getElementById("snap-to-grid");

let showInfo = true;
const infoText = "click to add vertex";

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

let mode = 0;
let ctrlPressed = false;
let spacePressed = false;
let shiftPressed = false;

let mousePos = {
	x: 0,
	y: 0
};

let lastMousePos = {
	x: 0,
	y: 0
};

let offset = {
	x: 0.0,
	y: 0.0
};

let scale = {
	x: 0.2,
	y: 0.2
};

const minScale = 0.05;
const maxScale = 20.0;

let vertices = [];
let selectedVertices = [];

let squareVerticesBuffer = null;

let currentTool = 'draw';
let previousTool = 'draw';
let isDragging = false;
let hasMoved = false;
let rectSelectStart = null;
let isDraggingMove = false;
let snappingEnabled = false;
let zoomFromCursor = false;
let panSnapEnabled = false;

function deleteSelected() {
    if (selectedVertices.length === 0) return;
    // sort descending to remove from end
    selectedVertices.sort((a,b) => b - a);
    for (let idx of selectedVertices) {
        vertices.splice(idx * 2, 2);
    }
    selectedVertices = [];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
}

function setActiveTool(activeButton) {
	[toolPan, toolSelect, toolDraw, toolMove].forEach(btn => btn.classList.remove('button-active'));
	activeButton.classList.add('button-active');
}

function updateActiveButton() {
	if (currentTool === 'pan') setActiveTool(toolPan);
	else if (currentTool === 'select') setActiveTool(toolSelect);
	else if (currentTool === 'draw') setActiveTool(toolDraw);
	else if (currentTool === 'move') setActiveTool(toolMove);
}

function getCursorForTool(tool) {
	switch (tool) {
		case 'pan': return 'grab';
		case 'select': return 'crosshair';
		case 'draw': return 'crosshair';
		default: return 'default';
	}
}


glPrimitiveType.addEventListener("change", e => {
	mode = glPrimitiveType.selectedIndex;
});

toolPan.addEventListener("click", () => {
	currentTool = 'pan';
	previousTool = 'pan';
	setActiveTool(toolPan);
});

toolSelect.addEventListener("click", () => {
	currentTool = 'select';
	previousTool = 'select';
	setActiveTool(toolSelect);
});

toolDraw.addEventListener("click", () => {
	currentTool = 'draw';
	previousTool = 'draw';
	setActiveTool(toolDraw);
});

toolMove.addEventListener("click", () => {
	currentTool = 'move';
	previousTool = 'move';
	setActiveTool(toolMove);
});

snapToGridCheckbox.addEventListener("change", e => {
	snappingEnabled = e.target.checked;
});

clearVertices.addEventListener("click", e => {
	vertices = [];
	selectedVertices = [];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
});

window.addEventListener("resize", e => {
	adjustCanvasSize();
});

window.addEventListener("keydown", e => {
	keys[e.key] = true;

	if (e.key == "u") mode = Math.min(mode+1, 6);
	if (e.key == "j") mode = Math.max(mode-1, 0);

	if (e.key === 'a' && e.ctrlKey) {
		e.preventDefault();
		selectedVertices = vertices.length > 0 ? Array.from({ length: vertices.length / 2 }, (_, i) => i) : [];
	}

	if (e.key === 'd') {
		currentTool = 'draw';
		previousTool = 'draw';
		updateActiveButton();
	}
	if (e.key === 'm') {
		currentTool = 'move';
		previousTool = 'move';
		updateActiveButton();
	}
	if (e.key === 's') {
		currentTool = 'select';
		previousTool = 'select';
		updateActiveButton();
	}
	if (e.key === 'p') {
		currentTool = 'pan';
		previousTool = 'pan';
		updateActiveButton();
	}
	if (e.key === 'z' && !e.ctrlKey) {
		zoomFromCursor = !zoomFromCursor;
	}
	if (e.key === 'g' && !e.ctrlKey) {
		panSnapEnabled = !panSnapEnabled;
	}

	glPrimitiveType.selectedIndex = mode;

	if (e.key === " " && !spacePressed) {
		spacePressed = true;
		previousTool = currentTool;
		currentTool = 'pan';
		updateActiveButton();
		e.preventDefault();
	}
	if (e.ctrlKey && !ctrlPressed) {
		ctrlPressed = true;
		previousTool = currentTool;
		currentTool = 'select';
		updateActiveButton();
	}
	if (e.key === 'Shift' && !shiftPressed && currentTool !== 'select') {
		shiftPressed = true;
		previousTool = currentTool;
		currentTool = 'select';
		updateActiveButton();
	}

	if (e.key === "Home") {
		offset.x = 0;
		offset.y = 0;
		scale.x = 1.0;
	}

	if (e.key === "Delete") {
		deleteSelected();
	}
	if (currentTool === 'move' && e.key.startsWith('Arrow')) {
		e.preventDefault();
	}
});

window.addEventListener("keyup", e => {
	keys[e.key] = false;
	if (e.key === " ") {
		spacePressed = false;
		currentTool = previousTool;
		if (isDragging) isDragging = false;
		updateActiveButton();
	}
	if (!e.ctrlKey && ctrlPressed) {
		ctrlPressed = false;
		currentTool = previousTool;
		updateActiveButton();
	}
	if (e.key === 'Shift') {
		shiftPressed = false;
		currentTool = previousTool;
		updateActiveButton();
	}
});

canvas.addEventListener("mousedown", e => {
	lastMousePos.x = e.offsetX;
	lastMousePos.y = e.offsetY;
	if (e.button === 0) {  // left mouse button only
		isDragging = true;
		hasMoved = false;

		if (showInfo) {
			showInfo = false;
		}

		if (currentTool === 'pan') {
			// start panning
		} else if (currentTool === 'draw') {
			let worldX = (2 * e.offsetX / canvas.width - 1) / scale.x - offset.x;
			let worldY = -(2 * e.offsetY / canvas.height - 1) / scale.y - offset.y;
			if (snappingEnabled) {
				[worldX, worldY] = snapToGrid(worldX, worldY);
			}
			vertices.push(worldX, worldY);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
		} else if (currentTool === 'move') {
			if (selectedVertices.length > 0) {
				isDraggingMove = true;
			}
		} else if (currentTool === 'select') {
			rectSelectStart = { x: e.offsetX, y: e.offsetY };
		}
	}
	// for select and move, handle in mousemove and mouseup
});

canvas.addEventListener("wheel", e => {
	e.preventDefault();
	const zoomFactor = 1.1;
	const oldScale = scale.x;
	let newScale = oldScale;
	if (e.deltaY < 0) {
		newScale = oldScale * zoomFactor;
	} else {
		newScale = oldScale / zoomFactor;
	}
	newScale = Math.max(minScale, Math.min(maxScale, newScale));

	if (zoomFromCursor) {
		const cursorX = 2 * e.offsetX / canvas.width - 1;
		const cursorY = 2 * e.offsetY / canvas.height - 1;
		offset.x += cursorX * (1 / newScale - 1 / oldScale);
		offset.y += cursorY * (1 / oldScale - 1 / newScale);
	}

	scale.x = newScale;
	scale.y = scale.x * (canvas.width / canvas.height);
});

window.addEventListener("mouseup", e => {
	if (e.button === 0) {  // left mouse button only
		finalizeDragOperation();
	}
});

function finalizeDragOperation() {
	isDragging = false;
	if (isDraggingMove && snappingEnabled) {
		// snap selected vertices to grid as a group
		if (selectedVertices.length > 0) {
			let sumX = 0, sumY = 0;
			for (let idx of selectedVertices) {
				sumX += vertices[idx * 2];
				sumY += vertices[idx * 2 + 1];
			}
			const avgX = sumX / selectedVertices.length;
			const avgY = sumY / selectedVertices.length;
			const [snappedAvgX, snappedAvgY] = snapToGrid(avgX, avgY);
			const deltaX = snappedAvgX - avgX;
			const deltaY = snappedAvgY - avgY;
			for (let idx of selectedVertices) {
				vertices[idx * 2] += deltaX;
				vertices[idx * 2 + 1] += deltaY;
			}
		}
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
	}
	if (currentTool === 'pan' && panSnapEnabled) {
		const step = Math.pow(10, Math.floor(Math.log10(1 / Math.max(scale.x, scale.y))));
		offset.x = Math.round(offset.x / step) * step;
		offset.y = Math.round(offset.y / step) * step;
	}
	
	isDraggingMove = false;
	if (rectSelectStart) {
		if (hasMoved) {
			// finish rect select
			const rectEnd = { x: mousePos.x, y: mousePos.y };
			const minX = Math.min(rectSelectStart.x, rectEnd.x);
			const maxX = Math.max(rectSelectStart.x, rectEnd.x);
			const minY = Math.min(rectSelectStart.y, rectEnd.y);
			const maxY = Math.max(rectSelectStart.y, rectEnd.y);
			let newSelected = [];
			for (let i = 0; i < vertices.length; i += 2) {
				const screenX = ((vertices[i] + offset.x) * scale.x + 1) * canvas.width / 2;
				const screenY = ((-vertices[i+1] - offset.y) * scale.y + 1) * canvas.height / 2;
				if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
					newSelected.push(i / 2);
				}
			}
			if (keys['Control'] && keys['Shift']) {
				selectedVertices = [...new Set([...selectedVertices, ...newSelected])];
			} else {
				selectedVertices = newSelected;
			}
		} else {
			// click select nearest vertex
			const worldX = (2 * rectSelectStart.x / canvas.width - 1) / scale.x - offset.x;
			const worldY = -(2 * rectSelectStart.y / canvas.height - 1) / scale.y - offset.y;
			let nearestIndex = -1;
			let minDist = Infinity;
			for (let i = 0; i < vertices.length; i += 2) {
				const dx = vertices[i] - worldX;
				const dy = vertices[i+1] - worldY;
				const dist = Math.sqrt(dx*dx + dy*dy);
				if (dist < minDist) {
					minDist = dist;
					nearestIndex = i / 2;
				}
			}
			if (minDist < 0.05) { // threshold
				if (keys['Control'] && keys['Shift']) {
					if (!selectedVertices.includes(nearestIndex)) {
						selectedVertices.push(nearestIndex);
					}
				} else {
					selectedVertices = [nearestIndex];
				}
			} else {
				selectedVertices = [];
			}
		}
		rectSelectStart = null;
	}
}

canvas.addEventListener("mousemove", e => {
	mousePos.x = e.offsetX;
	mousePos.y = e.offsetY;
	hasMoved = true;

	if (isDragging && currentTool === 'pan') {
		const deltaX = (e.offsetX - lastMousePos.x) / canvas.width * 2 / scale.x;
		const deltaY = (e.offsetY - lastMousePos.y) / canvas.height * 2 / scale.y;
		offset.x += deltaX;
		offset.y -= deltaY;
		lastMousePos.x = e.offsetX;
		lastMousePos.y = e.offsetY;
	}

	if (isDragging && currentTool === 'select' && !rectSelectStart) {
		rectSelectStart = { x: lastMousePos.x, y: lastMousePos.y };
	}

	if (isDragging && currentTool === 'move' && isDraggingMove) {
		const deltaX = (e.offsetX - lastMousePos.x) / canvas.width * 2 / scale.x;
		const deltaY = -(e.offsetY - lastMousePos.y) / canvas.height * 2 / scale.y;
		for (let idx of selectedVertices) {
			vertices[idx * 2] += deltaX;
			vertices[idx * 2 + 1] += deltaY;
		}
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
		lastMousePos.x = e.offsetX;
		lastMousePos.y = e.offsetY;
	}
});

window.addEventListener("mousemove", e => {
	const rect = canvas.getBoundingClientRect();
	mousePos.x = e.clientX - rect.left;
	mousePos.y = e.clientY - rect.top;
	hasMoved = true;
});

Promise.all([
	fetch("shaders/vertex.shader"),
	fetch("shaders/fragment.shader")
])
.then(async shaders => {
	adjustCanvasSize();

	initializeWebGL();
	await makeShaders(shaders);
	initBuffers();

	setActiveTool(toolDraw);

	draw();
});

function adjustCanvasSize() {
	canvas.width = canvas_info.width = window.innerWidth;
	canvas.height = canvas_info.height = window.innerHeight;
	gl.viewport(0, 0, canvas.width, canvas.height);
}

function initializeWebGL() {
	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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

function formatNumber(value) {
	return Number(value.toFixed(3));
}

function drawOutlinedText(text, x, y, fillStyle = "white", strokeStyle = "black", font = "14px Arial") {
	ctx.font = font;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = fillStyle;
	ctx.strokeStyle = strokeStyle;
	ctx.lineWidth = 3;
	ctx.strokeText(text, x, y);
	ctx.fillText(text, x, y);
}

function drawInfo() {
	ctx.resetTransform();
	ctx.clearRect(0, 0, canvas_info.width, canvas_info.height);

	if (showInfo) {
		ctx.font = "64px Arial";
		let size = ctx.measureText(infoText);
		let heightSize = ctx.measureText(infoText[0]);

		ctx.translate(canvas_info.width / 2, canvas_info.height / 2);
		drawOutlinedText(infoText, -size.width / 2, -heightSize.width / 2, "white", "black", "64px Arial");
		ctx.resetTransform();
	}

	const worldX = (2 * mousePos.x / canvas.width - 1) / scale.x - offset.x;
	const worldY = -(2 * mousePos.y / canvas.height - 1) / scale.y - offset.y;
	const snapped = snapToGrid(worldX, worldY);
	const zoomText = `Zoom: ${Math.round(scale.x * 100)}%`;
	const zoomOriginText = `Zoom origin: ${zoomFromCursor ? 'cursor' : 'center'}`;
	const panSnapText = `Pan snap: ${panSnapEnabled ? 'on' : 'off'}`;
	const offsetText = `Pan offset: ${formatNumber(offset.x)}, ${formatNumber(offset.y)}`;
	const cursorText = `Cursor: ${formatNumber(worldX)}, ${formatNumber(worldY)}`;
	const snapText = snappingEnabled ? `Snapped: ${formatNumber(snapped[0])}, ${formatNumber(snapped[1])}` : null;
	let selectionText = `Selected: ${selectedVertices.length}`;
	if (selectedVertices.length === 1) {
		const idx = selectedVertices[0];
		selectionText += ` (${formatNumber(vertices[idx*2])}, ${formatNumber(vertices[idx*2+1])})`;
	} else if (selectedVertices.length > 1) {
		const idx = selectedVertices[0];
		selectionText += ` | first: ${formatNumber(vertices[idx*2])}, ${formatNumber(vertices[idx*2+1])}`;
	}

	const padding = 10;
	drawOutlinedText(zoomText, padding, padding);
	drawOutlinedText(zoomOriginText, padding, padding + 18);
	drawOutlinedText(panSnapText, padding, padding + 36);
	drawOutlinedText(offsetText, padding, padding + 54);
	drawOutlinedText(cursorText, padding, padding + 72);
	if (snapText) {
		drawOutlinedText(snapText, padding, padding + 90);
		drawOutlinedText(selectionText, padding, padding + 108);
	} else {
		drawOutlinedText(selectionText, padding, padding + 90);
	}
}

function snapToGrid(x, y) {
	const step = Math.pow(10, Math.floor(Math.log10(1 / Math.max(scale.x, scale.y))));
	return [Math.round(x / step) * step, Math.round(y / step) * step];
}

function draw() {
	// handle arrow key movement for move tool
	if (currentTool === 'move' && selectedVertices.length > 0) {
		let dx = 0, dy = 0;
		const moveSpeed = 0.01;
		if (keys['ArrowUp']) dy += moveSpeed;
		if (keys['ArrowDown']) dy -= moveSpeed;
		if (keys['ArrowLeft']) dx -= moveSpeed;
		if (keys['ArrowRight']) dx += moveSpeed;
		if (dx !== 0 || dy !== 0) {
			for (let idx of selectedVertices) {
				vertices[idx * 2] += dx;
				vertices[idx * 2 + 1] += dy;
			}
			if (snappingEnabled) {
				// snap selected vertices to grid as a group
				if (selectedVertices.length > 0) {
					let sumX = 0, sumY = 0;
					for (let idx of selectedVertices) {
						sumX += vertices[idx * 2];
						sumY += vertices[idx * 2 + 1];
					}
					const avgX = sumX / selectedVertices.length;
					const avgY = sumY / selectedVertices.length;
					const [snappedAvgX, snappedAvgY] = snapToGrid(avgX, avgY);
					const deltaX = snappedAvgX - avgX;
					const deltaY = snappedAvgY - avgY;
					for (let idx of selectedVertices) {
						vertices[idx * 2] += deltaX;
						vertices[idx * 2 + 1] += deltaY;
					}
				}
			}
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
		}
	}

	scale.y = scale.x * (canvas.width / canvas.height);

	// compute cursor for move tool
	let cursor = getCursorForTool(currentTool);
	if (currentTool === 'move' && selectedVertices.length > 0) {
		const worldMouseX = (2 * mousePos.x / canvas.width - 1) / scale.x - offset.x;
		const worldMouseY = -(2 * mousePos.y / canvas.height - 1) / scale.y - offset.y;
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (let idx of selectedVertices) {
			const x = vertices[idx * 2];
			const y = vertices[idx * 2 + 1];
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
		if (worldMouseX >= minX && worldMouseX <= maxX && worldMouseY >= minY && worldMouseY <= maxY) {
			cursor = 'all-scroll';
		} else {
			cursor = 'default';
		}
	}
	canvas.style.cursor = cursor;

	drawInfo();

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.useProgram(shaderProgram);

	gl.uniform2f(offsetUniformLocation, offset.x, offset.y);
	gl.uniform2f(scaleUniformLocation, scale.x, scale.y);

	gl.uniform4f(colorUniformLocation, 1.0, 1.0, 1.0, 1.0);
	gl.drawArrays(mode, 0, vertices.length / 2);

	gl.uniform4f(colorUniformLocation, 0.0, 1.0, 0.0, 1.0);
	gl.drawArrays(gl.POINTS, 0, vertices.length / 2);

	// draw selected vertices in red
	if (selectedVertices.length > 0) {
		let selectedBuffer = [];
		for (let idx of selectedVertices) {
			selectedBuffer.push(vertices[idx*2], vertices[idx*2+1]);
		}
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(selectedBuffer), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorUniformLocation, 1.0, 0.0, 0.0, 1.0);
		gl.drawArrays(gl.POINTS, 0, selectedVertices.length);
		// restore buffer
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
	}

	// draw grid
	let gridVertices = [];
	const minX = -1 / scale.x - offset.x;
	const maxX = 1 / scale.x - offset.x;
	const minY = -1 / scale.y - offset.y;
	const maxY = 1 / scale.y - offset.y;
	const step = Math.pow(10, Math.floor(Math.log10(1 / Math.max(scale.x, scale.y))));
	for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
		gridVertices.push(x, minY, x, maxY);
	}
	for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
		gridVertices.push(minX, y, maxX, y);
	}
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridVertices), gl.DYNAMIC_DRAW);
	gl.uniform4f(colorUniformLocation, 0.0, 0.0, 0.0, 0.2); // very subtle black
	gl.drawArrays(gl.LINES, 0, gridVertices.length / 2);

	// draw finer grid (one level smaller)
	let fineGridVertices = [];
	const fineStep = step / 10;
	for (let x = Math.floor(minX / fineStep) * fineStep; x <= maxX; x += fineStep) {
		fineGridVertices.push(x, minY, x, maxY);
	}
	for (let y = Math.floor(minY / fineStep) * fineStep; y <= maxY; y += fineStep) {
		fineGridVertices.push(minX, y, maxX, y);
	}
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fineGridVertices), gl.DYNAMIC_DRAW);
	gl.uniform4f(colorUniformLocation, 0.0, 0.0, 0.0, 0.1); // more transparent
	gl.drawArrays(gl.LINES, 0, fineGridVertices.length / 2);

	// draw origin
	let originVertices = [-0.1, 0, 0.1, 0, 0, -0.1, 0, 0.1];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(originVertices), gl.DYNAMIC_DRAW);
	gl.uniform4f(colorUniformLocation, 0.0, 0.0, 0.0, 0.3); // subtle black
	gl.drawArrays(gl.LINES, 0, 4);

	// draw bounding box for move and select tools
	if ((currentTool === 'move' || currentTool === 'select') && selectedVertices.length > 1) {
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (let idx of selectedVertices) {
			const x = vertices[idx * 2];
			const y = vertices[idx * 2 + 1];
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
		// add padding for point size (approx 0.02 world units)
		// const padding = 0.02;
		// minX -= padding;
		// maxX += padding;
		// minY -= padding;
		// maxY += padding;
		let boxVertices = [
			minX, minY, maxX, minY, // bottom
			maxX, minY, maxX, maxY, // right
			maxX, maxY, minX, maxY, // top
			minX, maxY, minX, minY  // left
		];
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(boxVertices), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorUniformLocation, 1.0, 1.0, 1.0, 0.5); // white with alpha
		gl.drawArrays(gl.LINES, 0, 8);
	}

	// draw selection rectangle in screen space
	if (rectSelectStart) {
		// save current uniforms
		let savedOffsetX = offset.x;
		let savedOffsetY = offset.y;
		let savedScaleX = scale.x;
		let savedScaleY = scale.y;
		gl.uniform2f(offsetUniformLocation, 0, 0);
		gl.uniform2f(scaleUniformLocation, 1, 1);

		const startX = rectSelectStart.x;
		const startY = rectSelectStart.y;
		const endX = mousePos.x;
		const endY = mousePos.y;

		// convert to clip space (-1 to 1)
		const clipStartX = 2 * startX / canvas.width - 1;
		const clipStartY = 1 - 2 * startY / canvas.height;
		const clipEndX = 2 * endX / canvas.width - 1;
		const clipEndY = 1 - 2 * endY / canvas.height;

		let rectVertices = [
			clipStartX, clipStartY, clipEndX, clipStartY, // top
			clipEndX, clipStartY, clipEndX, clipEndY, // right
			clipEndX, clipEndY, clipStartX, clipEndY, // bottom
			clipStartX, clipEndY, clipStartX, clipStartY  // left
		];
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rectVertices), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorUniformLocation, 0.0, 1.0, 1.0, 0.5); // pleasant cyan
		gl.drawArrays(gl.LINES, 0, 8);

		// restore uniforms
		gl.uniform2f(offsetUniformLocation, savedOffsetX, savedOffsetY);
		gl.uniform2f(scaleUniformLocation, savedScaleX, savedScaleY);
	}

	// restore buffer
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

	// draw transparent dot under cursor in draw tool
	if (currentTool === 'draw') {
		let dotX = (2 * mousePos.x / canvas.width - 1) / scale.x - offset.x;
		let dotY = -(2 * mousePos.y / canvas.height - 1) / scale.y - offset.y;
		if (snappingEnabled) {
			[dotX, dotY] = snapToGrid(dotX, dotY);
		}
		let dotVertices = [dotX, dotY];
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dotVertices), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorUniformLocation, 1.0, 1.0, 1.0, 0.5); // white with alpha
		gl.drawArrays(gl.POINTS, 0, 1);
		// restore buffer
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
	}

	requestAnimationFrame(draw);
}