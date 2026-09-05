
const canvas = document.getElementById("canv");
const canvas_info = document.getElementById("canv_info");

const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
const ctx = canvas_info.getContext("2d");
const glPrimitiveType = document.getElementById("gl-primitive-type");

const clearVertices = document.getElementById("clear-vertices");
const toolPan = document.getElementById("tool-pan");
const toolSelect = document.getElementById("tool-select");
const toolDraw = document.getElementById("tool-draw");
const toolMove = document.getElementById("tool-move");
const snapToGridCheckbox = document.getElementById("snap-to-grid");
const themeToggle = document.getElementById("theme-toggle");
const vertexSidebar = document.getElementById("vertex-sidebar");
const sidebarHandle = document.getElementById("sidebar-handle");
const sidebarPin = document.getElementById("sidebar-pin");
const sidebarResize = document.getElementById("sidebar-resize");
const vertexList = document.getElementById("vertex-list");
const vertexCount = document.getElementById("vertex-count");
const groupList = vertexList;
const groupSelectedButton = document.getElementById("group-selected");
const ungroupSelectedButton = document.getElementById("ungroup-selected");

const themeNames = ["system", "light", "dark"];
const themeStorageKey = "gl-primitives-theme";
const stateStorageKey = "gl-primitives-state";
const pendingStateStorageKey = "gl-primitives-pending";
const saveDialog = document.getElementById("save-dialog");
const saveChangesButton = document.getElementById("save-changes");
const discardChangesButton = document.getElementById("discard-changes");
const themeColors = {
	light: { background: [0.94, 0.94, 0.94, 1.0], grid: [0.0, 0.0, 0.0], foreground: [0.0, 0.0, 0.0], infoFill: "black", infoStroke: "white" },
	dark: { background: [0.08, 0.08, 0.08, 1.0], grid: [1.0, 1.0, 1.0], foreground: [1.0, 1.0, 1.0], infoFill: "white", infoStroke: "black" }
};
let selectedTheme = "system";
let activeTheme = "light";

var showInfo = true;
const infoText = "click to add vertex";

var vertexShaderString = null;
var fragmentShaderString = null;

var vertexShader = null;
var fragmentShader = null;

var shaderProgram = null;

var vertexAttributeLocation = 0;

var offsetUniformLocation = 0;
var scaleUniformLocation = 0;

var colorUniformLocation = 0;

var keys = {};

var mode = 0;
var ctrlPressed = false;
var spacePressed = false;
var shiftPressed = false;

var mousePos = {
	x: 0,
	y: 0
};

var lastMousePos = {
	x: 0,
	y: 0
};

var offset = {
	x: 0.0,
	y: 0.0
};

var scale = {
	x: 0.2,
	y: 0.2
};

const minScale = 0.05;
const maxScale = 20.0;

var vertices = [];
var vertexNames = [];
var selectedVertices = [];
var selectionAnchorIndex = null;
var vertexGroups = [];
var nextGroupId = 1;
var collapsedGroupIds = new Set();

var squareVerticesBuffer = null;

var currentTool = 'draw';
var previousTool = 'draw';
var isDragging = false;
var hasMoved = false;
var rectSelectStart = null;
var isDraggingMove = false;
var snappingEnabled = false;
var zoomFromCursor = false;
var panSnapEnabled = false;
var sidebarOpen = false;
var sidebarPinned = false;
var sidebarWidth = 280;
var isResizingSidebar = false;
var renderedVertexState = "";
var renamingVertexIndex = null;
var renamingVertexIndices = [];
var renamingGroupId = null;
var isRenderingVertexList = false;
var savedStateJson = "";

function getAppState() {
	return {
		version: 2,
		theme: selectedTheme,
		primitiveType: mode,
		tool: currentTool,
		vertices,
		vertexNames,
		vertexGroups,
		collapsedGroups: [...collapsedGroupIds],
		selectedVertices,
		offset,
		scale,
		snappingEnabled,
		zoomFromCursor,
		panSnapEnabled,
		showInfo
	};
}

function getAppStateJson() {
	return JSON.stringify(getAppState());
}

function saveAppState(stateJson = getAppStateJson()) {
	localStorage.setItem(stateStorageKey, stateJson);
	localStorage.removeItem(pendingStateStorageKey);
	savedStateJson = stateJson;
}

function restoreAppState(stateJson) {
	try {
		const state = JSON.parse(stateJson);
		if (!state || ![1, 2].includes(state.version)) return false;
		if (themeNames.includes(state.theme)) selectedTheme = state.theme;
		mode = Number.isInteger(state.primitiveType) ? Math.max(0, Math.min(6, state.primitiveType)) : mode;
		if (["pan", "select", "draw", "move"].includes(state.tool)) currentTool = state.tool;
		if (Array.isArray(state.vertices) && state.vertices.every(value => typeof value === "number")) vertices = state.vertices;
		if (Array.isArray(state.vertexNames)) vertexNames = state.vertexNames.map(name => String(name));
		while (vertexNames.length < vertices.length / 2) vertexNames.push("");
		vertexNames.length = vertices.length / 2;
		if (Array.isArray(state.selectedVertices)) selectedVertices = state.selectedVertices.filter(index => Number.isInteger(index) && index >= 0 && index < vertices.length / 2);
		if (state.version >= 2 && Array.isArray(state.vertexGroups)) {
			vertexGroups = state.vertexGroups.map((group, index) => ({
				id: Number.isInteger(group.id) ? group.id : index + 1,
				name: String(group.name || `Group ${index + 1}`),
				primitiveType: Number.isInteger(group.primitiveType) ? Math.max(0, Math.min(6, group.primitiveType)) : mode,
				indices: Array.isArray(group.indices) ? group.indices.filter(vertexIndex => Number.isInteger(vertexIndex) && vertexIndex >= 0 && vertexIndex < vertices.length / 2) : []
			})).filter(group => group.indices.length > 0);
			nextGroupId = Math.max(0, ...vertexGroups.map(group => group.id)) + 1;
			collapsedGroupIds = new Set(Array.isArray(state.collapsedGroups) ? state.collapsedGroups : []);
		}
		if (state.offset && Number.isFinite(state.offset.x) && Number.isFinite(state.offset.y)) offset = { x: state.offset.x, y: state.offset.y };
		if (state.scale && Number.isFinite(state.scale.x)) scale.x = Math.max(minScale, Math.min(maxScale, state.scale.x));
		snappingEnabled = Boolean(state.snappingEnabled);
		zoomFromCursor = Boolean(state.zoomFromCursor);
		panSnapEnabled = Boolean(state.panSnapEnabled);
		showInfo = state.showInfo !== false;
		selectionAnchorIndex = selectedVertices.at(-1) ?? null;
		return true;
	} catch {
		return false;
	}
}

function openSaveDialog(pendingJson) {
	saveDialog.hidden = false;
	saveChangesButton.onclick = () => {
		restoreAppState(pendingJson);
		applyTheme();
		glPrimitiveType.selectedIndex = mode;
		updateActiveButton();
		renderedVertexState = "";
		renderVertexList();
		saveAppState(pendingJson);
		saveDialog.hidden = true;
	};
	discardChangesButton.onclick = () => {
		localStorage.removeItem(pendingStateStorageKey);
		saveDialog.hidden = true;
	};
}

function updateSidebarLayout() {
	const content = document.getElementById("content");
	content.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
	content.classList.toggle("is-pinned", sidebarPinned);
	vertexSidebar.classList.toggle("is-pinned", sidebarPinned);
	sidebarHandle.classList.toggle("is-pinned", sidebarPinned);
	if (sidebarPinned) {
		vertexSidebar.classList.add("is-open");
		sidebarHandle.classList.remove("is-open");
	} else {
		vertexSidebar.classList.toggle("is-open", sidebarOpen);
		sidebarHandle.classList.toggle("is-open", sidebarOpen);
	}
	sidebarHandle.textContent = sidebarOpen ? "<" : ">";
	sidebarPin.textContent = sidebarPinned ? "unpin" : "pin";
	sidebarPin.setAttribute("aria-label", `${sidebarPinned ? "Unpin" : "Pin"} sidebar`);
	sidebarPin.setAttribute("title", `${sidebarPinned ? "Unpin" : "Pin"} sidebar`);
	sidebarPin.setAttribute("aria-pressed", sidebarPinned);
	adjustCanvasSize();
}

function formatVertex(value) {
	return Number(value.toFixed(3));
}

function centerViewOnVertices(indices) {
	if (indices.length === 0) return;
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const index of indices) {
		const x = vertices[index * 2];
		const y = vertices[index * 2 + 1];
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
	}
	offset.x = -(minX + maxX) / 2;
	offset.y = -(minY + maxY) / 2;
}

function scrollVertexListToIndex(index) {
	requestAnimationFrame(() => requestAnimationFrame(() => {
		const row = vertexList.querySelector(`[data-index="${index}"]`);
		if (!row) return;
		const maxScrollTop = Math.max(0, vertexList.scrollHeight - vertexList.clientHeight);
		vertexList.scrollTop = index === 0 ? 0 : Math.min(row.offsetTop, maxScrollTop);
	}));
}

function primitiveOptions(selectedType) {
	return Array.from({ length: 7 }, (_, index) => `<option value="${index}"${index === selectedType ? " selected" : ""}>${glPrimitiveType.options[index].textContent}</option>`).join("");
}

function renderGroupList() {
	groupList.replaceChildren();
	for (const group of vertexGroups) {
		const item = document.createElement("div");
		item.className = "group-item";
		item.dataset.groupId = group.id;
		item.tabIndex = 0;
		item.setAttribute("role", "listitem");
		item.classList.toggle("is-selected", group.indices.every(index => selectedVertices.includes(index)));
		const name = document.createElement("span");
		name.className = "group-name";
		name.textContent = `${group.name} (${group.indices.length})`;
		const toggle = document.createElement("button");
		toggle.className = "group-toggle";
		toggle.type = "button";
		toggle.textContent = collapsedGroupIds.has(group.id) ? ">" : "v";
		toggle.setAttribute("aria-label", `${collapsedGroupIds.has(group.id) ? "Expand" : "Collapse"} ${group.name}`);
		toggle.addEventListener("click", event => {
			event.stopPropagation();
			if (collapsedGroupIds.has(group.id)) collapsedGroupIds.delete(group.id);
			else collapsedGroupIds.add(group.id);
			renderedVertexState = "";
			renderVertexList();
		});
		item.appendChild(toggle);
		item.appendChild(name);
		if (renamingGroupId === group.id) {
			const input = document.createElement("input");
			input.className = "vertex-name-input";
			input.value = group.name;
			name.replaceWith(input);
			input.addEventListener("keydown", event => {
				event.stopPropagation();
				if (event.key === "Enter") { event.preventDefault(); commitGroupRename(input.value); }
				if (event.key === "Escape") { event.preventDefault(); cancelGroupRename(); }
			});
			input.addEventListener("blur", () => commitGroupRename(input.value), { once: true });
			requestAnimationFrame(() => { input.focus(); input.select(); });
		} else {
			const type = document.createElement("select");
			type.className = "group-type";
			type.innerHTML = primitiveOptions(group.primitiveType);
			type.addEventListener("click", event => event.stopPropagation());
			type.addEventListener("change", event => { group.primitiveType = Number(event.target.value); renderedVertexState = ""; });
			item.appendChild(type);
		}
		item.addEventListener("click", event => {
			if (event.target.matches("input, select")) return;
			selectedVertices = [...group.indices];
			selectionAnchorIndex = selectedVertices.at(-1) ?? null;
			renderedVertexState = "";
			renderVertexList();
			requestAnimationFrame(() => groupList.querySelector(`[data-group-id="${group.id}"]`)?.focus());
		});
		item.addEventListener("dblclick", event => {
			if (!event.target.closest(".group-name")) return;
			event.preventDefault();
			selectedVertices = [...group.indices];
			selectionAnchorIndex = selectedVertices.at(-1) ?? null;
			centerViewOnVertices(group.indices);
			renderedVertexState = "";
			renderVertexList();
			const firstGroupIndex = Math.min(...group.indices);
			scrollVertexListToIndex(firstGroupIndex);
			requestAnimationFrame(() => groupList.querySelector(`[data-group-id="${group.id}"]`)?.focus());
		});
		item.addEventListener("keydown", event => {
			if (event.key === "F2") {
				event.preventDefault();
				event.stopPropagation();
				renamingGroupId = group.id;
				renderedVertexState = "";
				renderVertexList();
			}
		});
		groupList.appendChild(item);
	}
}

function renderVertexList() {
	const state = `${vertices.join(",")}|${vertexNames.join("|")}|${JSON.stringify(vertexGroups)}|${selectedVertices.join(",")}|${renamingVertexIndex}|${renamingVertexIndices.join(",")}|${renamingGroupId}`;
	if (state === renderedVertexState) return;
	renderedVertexState = state;
	const scrollTop = vertexList.scrollTop;
	vertexCount.textContent = vertices.length / 2;
	isRenderingVertexList = true;
	vertexList.replaceChildren();
	renderGroupList();

	for (let index = 0; index < vertices.length / 2; index++) {
		const item = document.createElement("div");
		item.className = "vertex-item";
		item.dataset.index = index;
		item.setAttribute("role", "listitem");
		item.tabIndex = 0;
		item.classList.toggle("is-selected", selectedVertices.includes(index));
		const name = vertexNames[index] || `Vertex ${index}`;
		item.innerHTML = `<span class="vertex-index">#${index}</span><span class="vertex-name"></span><span class="vertex-position">${formatVertex(vertices[index * 2])}, ${formatVertex(vertices[index * 2 + 1])}</span>`;
		item.querySelector(".vertex-name").textContent = name;
		if (renamingVertexIndex === index) {
			const nameElement = item.querySelector(".vertex-name");
			const input = document.createElement("input");
			input.className = "vertex-name-input";
			input.value = vertexNames[index] || "";
			input.placeholder = `Vertex ${index}`;
			nameElement.replaceWith(input);
			input.addEventListener("keydown", event => {
				event.stopPropagation();
				if (event.key === "Enter") {
					event.preventDefault();
					commitVertexRename(input.value);
				} else if (event.key === "Escape") {
					event.preventDefault();
					cancelVertexRename();
				}
			});
			input.addEventListener("blur", () => {
				if (isRenderingVertexList) {
					setTimeout(() => commitVertexRename(input.value), 0);
				} else {
					commitVertexRename(input.value);
				}
			}, { once: true });
			requestAnimationFrame(() => {
				input.focus();
				input.select();
			});
		}
		item.addEventListener("click", event => {
			if (event.target.matches("input")) return;
			item.focus();
			if (event.shiftKey && selectionAnchorIndex !== null) {
				const rangeStart = Math.min(selectionAnchorIndex, index);
				const rangeEnd = Math.max(selectionAnchorIndex, index);
				const range = Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => rangeStart + offset);
				selectedVertices = event.ctrlKey || event.metaKey
					? [...new Set([...selectedVertices, ...range])]
					: range;
			} else if (event.ctrlKey || event.metaKey) {
				if (selectedVertices.includes(index)) {
					selectedVertices = selectedVertices.filter(selectedIndex => selectedIndex !== index);
				} else {
					selectedVertices = [...selectedVertices, index];
				}
				selectionAnchorIndex = index;
			} else {
				selectedVertices = [index];
				selectionAnchorIndex = index;
			}
			renderedVertexState = "";
			renderVertexList();
			vertexList.querySelector(`[data-index="${index}"]`)?.focus();
		});
		item.addEventListener("dblclick", event => {
			if (event.target.closest("input")) return;
			event.preventDefault();
			selectedVertices = [index];
			selectionAnchorIndex = index;
			centerViewOnVertices([index]);
			renderedVertexState = "";
			renderVertexList();
			vertexList.querySelector(`[data-index="${index}"]`)?.focus();
		});
		item.addEventListener("keydown", event => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				item.click();
			}
		});
		vertexList.appendChild(item);
	}
	for (const group of vertexGroups) {
		const groupItem = vertexList.querySelector(`[data-group-id="${group.id}"]`);
		if (!groupItem) continue;
		let nextItem = groupItem.nextSibling;
		for (const index of [...group.indices].sort((a, b) => a - b)) {
			const vertexItem = vertexList.querySelector(`[data-index="${index}"]`);
			if (!vertexItem) continue;
			vertexItem.hidden = collapsedGroupIds.has(group.id);
			vertexList.insertBefore(vertexItem, nextItem);
			nextItem = vertexItem.nextSibling;
		}
	}
	isRenderingVertexList = false;
	vertexList.scrollTop = scrollTop;
}

vertexSidebar.addEventListener("click", event => {
	if (event.target.closest("button, input, select, .vertex-item, .group-item, #sidebar-resize")) return;
	selectedVertices = [];
	selectionAnchorIndex = null;
	renderedVertexState = "";
	renderVertexList();
});

function commitVertexRename(name) {
	if (renamingVertexIndex === null) return;
	const baseName = name.trim() || "Vertex";
	const focusIndex = renamingVertexIndices[0];
	renamingVertexIndices.forEach((index, order) => {
		vertexNames[index] = `${baseName} ${order + 1}`;
	});
	renamingVertexIndex = null;
	renamingVertexIndices = [];
	renderedVertexState = "";
	renderVertexList();
	vertexList.querySelector(`[data-index="${focusIndex}"]`)?.focus();
}

function cancelVertexRename() {
	renamingVertexIndex = null;
	renamingVertexIndices = [];
	renderedVertexState = "";
	renderVertexList();
}

sidebarHandle.addEventListener("click", () => {
	sidebarOpen = !sidebarOpen;
	updateSidebarLayout();
	sidebarHandle.setAttribute("aria-expanded", sidebarOpen);
	sidebarHandle.setAttribute("aria-label", `${sidebarOpen ? "Hide" : "Show"} vertex sidebar`);
});

sidebarPin.addEventListener("click", () => {
	sidebarPinned = !sidebarPinned;
	sidebarOpen = true;
	updateSidebarLayout();
	sidebarHandle.setAttribute("aria-expanded", true);
});

sidebarResize.addEventListener("mousedown", event => {
	event.preventDefault();
	isResizingSidebar = true;
	document.getElementById("content").classList.add("is-resizing");
	document.body.style.cursor = "ew-resize";
});

window.addEventListener("mousemove", event => {
	if (!isResizingSidebar) return;
	const sidebarLeft = vertexSidebar.getBoundingClientRect().left;
	sidebarWidth = Math.max(220, Math.min(420, event.clientX - sidebarLeft));
	updateSidebarLayout();
});

window.addEventListener("mouseup", () => {
	if (!isResizingSidebar) return;
	isResizingSidebar = false;
	document.getElementById("content").classList.remove("is-resizing");
	document.body.style.cursor = "";
});

function getActiveTheme() {
	if (selectedTheme !== "system") return selectedTheme;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
	activeTheme = getActiveTheme();
	if (selectedTheme === "system") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.dataset.theme = selectedTheme;
	}
	const label = `Theme: ${selectedTheme[0].toUpperCase()}${selectedTheme.slice(1)}`;
	themeToggle.textContent = label;
	themeToggle.setAttribute("aria-label", `Color theme: ${label.slice(7)}`);
}

themeToggle.addEventListener("click", () => {
	selectedTheme = themeNames[(themeNames.indexOf(selectedTheme) + 1) % themeNames.length];
	applyTheme();
});

window.addEventListener("storage", event => {
	if (event.key !== themeStorageKey || !themeNames.includes(event.newValue)) return;
	selectedTheme = event.newValue;
	applyTheme();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
	if (selectedTheme === "system") applyTheme();
});

const storedState = localStorage.getItem(stateStorageKey);
if (storedState) restoreAppState(storedState);
else {
	const storedTheme = localStorage.getItem(themeStorageKey);
	if (themeNames.includes(storedTheme)) selectedTheme = storedTheme;
}
localStorage.removeItem(themeStorageKey);
applyTheme();

const pendingState = localStorage.getItem(pendingStateStorageKey);
if (pendingState) openSaveDialog(pendingState);

window.addEventListener("beforeunload", event => {
	const currentStateJson = getAppStateJson();
	if (currentStateJson === savedStateJson) return;
	localStorage.setItem(pendingStateStorageKey, currentStateJson);
	event.preventDefault();
	event.returnValue = "Unsaved changes";
});

saveChangesButton.addEventListener("click", () => saveAppState());

discardChangesButton.addEventListener("click", () => {
	localStorage.removeItem(pendingStateStorageKey);
	const stored = localStorage.getItem(stateStorageKey);
	if (stored) restoreAppState(stored);
	applyTheme();
	renderedVertexState = "";
	renderVertexList();
	glPrimitiveType.selectedIndex = mode;
	updateActiveButton();
	saveDialog.hidden = true;
});

savedStateJson = getAppStateJson();

function deleteSelected() {
	if (selectedVertices.length === 0) return;
	const deleted = new Set(selectedVertices);
	const indexMap = new Map();
	let nextIndex = 0;
	const nextVertices = [];
	const nextNames = [];
	for (let index = 0; index < vertices.length / 2; index++) {
		if (deleted.has(index)) continue;
		indexMap.set(index, nextIndex++);
		nextVertices.push(vertices[index * 2], vertices[index * 2 + 1]);
		nextNames.push(vertexNames[index] || "");
	}
	vertices = nextVertices;
	vertexNames = nextNames;
	vertexGroups = vertexGroups.map(group => ({ ...group, indices: group.indices.filter(index => !deleted.has(index)).map(index => indexMap.get(index)) })).filter(group => group.indices.length > 0);
	selectedVertices = [];
	selectionAnchorIndex = null;
	renderedVertexState = "";
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
	vertexNames = [];
	vertexGroups = [];
	selectedVertices = [];
	selectionAnchorIndex = null;
	renderedVertexState = "";
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
});

window.addEventListener("resize", e => {
	adjustCanvasSize();
});

window.addEventListener("keydown", e => {
	const targetElement = e.target instanceof Element ? e.target : null;
	const targetIsTextInput = targetElement?.matches("input, textarea, [contenteditable=\"true\"]");
	if (targetIsTextInput) return;
	const vertexItemHasFocus = targetElement?.closest(".vertex-item") !== null;
	const canvasHasFocus = document.activeElement === canvas;
	const sidebarHasFocus = vertexSidebar.contains(document.activeElement);
	if (e.key === "F2" && (vertexItemHasFocus || sidebarHasFocus || canvasHasFocus) && selectedVertices.length > 0) {
		e.preventDefault();
		sidebarOpen = true;
		const index = selectedVertices[0];
		renamingVertexIndex = index;
		renamingVertexIndices = [...selectedVertices].sort((a, b) => a - b);
		renderedVertexState = "";
		updateSidebarLayout();
		return;
	}
	if ((canvasHasFocus || sidebarHasFocus) && e.key === 'a' && e.ctrlKey) {
		e.preventDefault();
		const allVertices = Array.from({ length: vertices.length / 2 }, (_, i) => i);
		const allSelected = allVertices.length > 0 && selectedVertices.length === allVertices.length;
		selectedVertices = allSelected ? [] : allVertices;
		selectionAnchorIndex = selectedVertices.length > 0 ? selectedVertices[selectedVertices.length - 1] : null;
		renderedVertexState = "";
		renderVertexList();
		if (sidebarHasFocus && selectedVertices.length > 0) {
			vertexList.querySelector(`[data-index="${selectedVertices[0]}"]`)?.focus();
		}
		return;
	}
	if ((canvasHasFocus || sidebarHasFocus) && e.key === "Delete") {
		e.preventDefault();
		deleteSelected();
		return;
	}
	if (!canvasHasFocus) return;
	keys[e.key] = true;

	if (e.key === "F2" && selectedVertices.length > 0) {
		e.preventDefault();
		sidebarOpen = true;
		const index = selectedVertices[0];
		renamingVertexIndex = index;
		renamingVertexIndices = [...selectedVertices].sort((a, b) => a - b);
		renderedVertexState = "";
		updateSidebarLayout();
		return;
	}

	if (e.key == "u") mode = Math.min(mode + 1, 6);
	if (e.key == "j") mode = Math.max(mode - 1, 0);

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

	if (currentTool === 'move' && e.key.startsWith('Arrow')) {
		e.preventDefault();
	}
});

window.addEventListener("keyup", e => {
	const targetElement = e.target instanceof Element ? e.target : null;
	if (targetElement?.matches("input, textarea, [contenteditable=\"true\"]") || document.activeElement !== canvas) return;
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
	const canvasHadFocus = document.activeElement === canvas;
	canvas.focus();
	if (!canvasHadFocus && currentTool === "draw") {
		mousePos.x = e.offsetX;
		mousePos.y = e.offsetY;
		return;
	}
	if (showInfo) {
		showInfo = false;
		savedStateJson = "";
	}
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
			vertexNames.push("");
			renderedVertexState = "";
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
				const screenY = ((-vertices[i + 1] - offset.y) * scale.y + 1) * canvas.height / 2;
				if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
					newSelected.push(i / 2);
				}
			}
			if (keys['Control'] && keys['Shift']) {
				selectedVertices = [...new Set([...selectedVertices, ...newSelected])];
			} else {
				selectedVertices = newSelected;
			}
			renderedVertexState = "";
		} else {
			// click select nearest vertex
			const worldX = (2 * rectSelectStart.x / canvas.width - 1) / scale.x - offset.x;
			const worldY = -(2 * rectSelectStart.y / canvas.height - 1) / scale.y - offset.y;
			let nearestIndex = -1;
			let minDist = Infinity;
			for (let i = 0; i < vertices.length; i += 2) {
				const dx = vertices[i] - worldX;
				const dy = vertices[i + 1] - worldY;
				const dist = Math.sqrt(dx * dx + dy * dy);
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
			renderedVertexState = "";
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

		glPrimitiveType.selectedIndex = mode;
		updateActiveButton();

		draw();
	});

function adjustCanvasSize() {
	const content = document.getElementById("content");
	const canvasWidth = sidebarPinned ? content.clientWidth - sidebarWidth : window.innerWidth;
	canvas.width = canvas_info.width = Math.max(1, canvasWidth);
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

	vertexShader = gl.createShader(gl.VERTEX_SHADER);
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

function drawOutlinedText(text, x, y, fillStyle = null, strokeStyle = null, font = "14px Arial", textAlign="left", textBaseline="top") {
	ctx.font = font;
	ctx.textAlign = textAlign;
	ctx.textBaseline = textBaseline;
	ctx.fillStyle = fillStyle ?? themeColors[activeTheme].infoFill;
	ctx.strokeStyle = strokeStyle ?? themeColors[activeTheme].infoStroke;
	ctx.lineWidth = 3;
	ctx.strokeText(text, x, y);
	ctx.fillText(text, x, y);
}

function drawInfo() {
	ctx.resetTransform();
	ctx.clearRect(0, 0, canvas_info.width, canvas_info.height);
	const colors = themeColors[activeTheme];

	if (showInfo) {
		const x = canvas_info.width / 2;
		const y = canvas_info.height / 2;

		drawOutlinedText(infoText, x, y, colors.infoFill, colors.infoStroke, "64px Arial", "center", "middle");
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
		selectionText += ` (${formatNumber(vertices[idx * 2])}, ${formatNumber(vertices[idx * 2 + 1])})`;
	} else if (selectedVertices.length > 1) {
		const idx = selectedVertices[0];
		selectionText += ` | first: ${formatNumber(vertices[idx * 2])}, ${formatNumber(vertices[idx * 2 + 1])}`;
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

	renderVertexList();
	drawInfo();

	const colors = themeColors[activeTheme];
	gl.clearColor(...colors.background);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.useProgram(shaderProgram);

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
	gl.uniform4f(colorUniformLocation, ...colors.grid, 0.2);
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
	gl.uniform4f(colorUniformLocation, ...colors.grid, 0.1);
	gl.drawArrays(gl.LINES, 0, fineGridVertices.length / 2);

	// draw origin
	let originVertices = [-0.1, 0, 0.1, 0, 0, -0.1, 0, 0.1];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(originVertices), gl.DYNAMIC_DRAW);
	gl.uniform4f(colorUniformLocation, ...colors.grid, 0.3);
	gl.drawArrays(gl.LINES, 0, 4);

	// set ARRAY_BUFFER to vertices
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

	// draw primitives

	gl.uniform2f(offsetUniformLocation, offset.x, offset.y);
	gl.uniform2f(scaleUniformLocation, scale.x, scale.y);

	const groupedIndices = new Set(vertexGroups.flatMap(group => group.indices));
	const ungroupedIndices = Array.from({ length: vertices.length / 2 }, (_, index) => index).filter(index => !groupedIndices.has(index));
	const drawVertexIndices = (indices, primitiveType) => {
		if (indices.length === 0) return;
		const groupedVertices = indices.flatMap(index => [vertices[index * 2], vertices[index * 2 + 1]]);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(groupedVertices), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorUniformLocation, ...colors.foreground, 1.0);
		gl.drawArrays(primitiveType, 0, indices.length);
	};

	drawVertexIndices(ungroupedIndices, mode);
	for (const group of vertexGroups) {
		drawVertexIndices(group.indices, group.primitiveType);
	}

	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

	gl.uniform4f(colorUniformLocation, 0.0, 1.0, 0.0, 1.0);
	gl.drawArrays(gl.POINTS, 0, vertices.length / 2);

	// draw selected vertices in red
	if (selectedVertices.length > 0) {
		let selectedBuffer = [];
		for (let idx of selectedVertices) {
			selectedBuffer.push(vertices[idx * 2], vertices[idx * 2 + 1]);
		}
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(selectedBuffer), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorUniformLocation, 1.0, 0.0, 0.0, 1.0);
		gl.drawArrays(gl.POINTS, 0, selectedVertices.length);
		// restore buffer
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
	}

	// draw bounding box of selected vertices
	if ((["pan", "move", "select"].includes(currentTool)) && selectedVertices.length > 1) {
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
		gl.uniform4f(colorUniformLocation, ...colors.foreground, 0.5);
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

	// draw transparent dot under cursor in draw tool
	if (currentTool === 'draw') {
		let dotX = (2 * mousePos.x / canvas.width - 1) / scale.x - offset.x;
		let dotY = -(2 * mousePos.y / canvas.height - 1) / scale.y - offset.y;
		if (snappingEnabled) {
			[dotX, dotY] = snapToGrid(dotX, dotY);
		}
		let dotVertices = [dotX, dotY];
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dotVertices), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorUniformLocation, ...colors.foreground, 0.5);
		gl.drawArrays(gl.POINTS, 0, 1);
	}

	requestAnimationFrame(draw);
}

function commitGroupRename(name) {
	const group = vertexGroups.find(candidate => candidate.id === renamingGroupId);
	if (!group) return;
	group.name = name.trim() || "Group";
	renamingGroupId = null;
	renderedVertexState = "";
	renderVertexList();
}

function cancelGroupRename() {
	renamingGroupId = null;
	renderedVertexState = "";
	renderVertexList();
}

function groupSelectedVertices() {
	if (selectedVertices.length === 0) return;
	const indices = [...new Set(selectedVertices)].sort((a, b) => a - b);
	vertexGroups.forEach(group => { group.indices = group.indices.filter(index => !indices.includes(index)); });
	vertexGroups = vertexGroups.filter(group => group.indices.length > 0);
	vertexGroups.push({ id: nextGroupId++, name: `Group ${nextGroupId - 1}`, primitiveType: mode, indices });
	renderedVertexState = "";
	renderVertexList();
}

function ungroupSelectedVertices() {
	const selected = new Set(selectedVertices);
	vertexGroups.forEach(group => { group.indices = group.indices.filter(index => !selected.has(index)); });
	vertexGroups = vertexGroups.filter(group => group.indices.length > 0);
	renderedVertexState = "";
	renderVertexList();
}

groupSelectedButton.addEventListener("click", groupSelectedVertices);
ungroupSelectedButton.addEventListener("click", ungroupSelectedVertices);