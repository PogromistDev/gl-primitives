class Vertex2f {
	constructor (x, y) {
		this.x = x;
		this.y = y;
	}
}

const canvas = document.getElementById("canv");
const glPrimitiveType = document.getElementById("gl-primitive-type");

const clearVertices = document.getElementById("clear-vertices");

let ctx;
let vertices = [];

(function init() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	
	ctx = canvas.getContext("2d");
	
	window.addEventListener("resize", () => {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	});
	
	clearVertices.addEventListener("click", () => {
		vertices = [];
	});
		
	canvas.addEventListener("mousedown", e => {
		if (e.button == 0) {
			vertices.push(new Vertex2f(e.offsetX, e.offsetY));
		}
	});
		
	(function redraw() {
		ctx.resetTransform();

		ctx.fillStyle = "black";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.fillStyle = "rgb(1, 255, 34)";
		ctx.strokeStyle = "black";

		for (let vertex of vertices) {
			ctx.resetTransform();
			ctx.translate(vertex.x, vertex.y);
			ctx.fillRect(-2.5, -2.5, 5, 5);
			ctx.strokeRect(-2.5, -2.5, 5, 5);
		}
		
		ctx.fillStyle = "white";

		ctx.resetTransform();
		switch (glPrimitiveType.value) {
			case "GL_LINES": {
				if (vertices.length > 1) {
					ctx.strokeStyle = "white";
					
					for (let i = 0; i < Math.floor(vertices.length / 2); i++) {
						let currentVertex = vertices[i * 2];
						let nextVertex = vertices[i * 2 + 1];
						
						ctx.beginPath();
						ctx.moveTo(currentVertex.x, currentVertex.y);
						ctx.lineTo(nextVertex.x, nextVertex.y);
						ctx.stroke();
					}
				}
			}
			break;
			
			case "GL_LINE_STRIP": {
				if (vertices.length > 1) {
					ctx.strokeStyle = "white";
					
					for (let i = 0; i < vertices.length - 1; i++) {
						let currentVertex = vertices[i];
						let nextVertex = vertices[i + 1];

						ctx.beginPath();
						ctx.moveTo(currentVertex.x, currentVertex.y);
						ctx.lineTo(nextVertex.x, nextVertex.y);
						ctx.stroke();
					}
				}
			}
			break;
			
			case "GL_LINE_LOOP": {
				if (vertices.length > 1) {
					ctx.strokeStyle = "white";
					for (let i = 0; i < vertices.length; i++) {
						let currentVertex = vertices[i];
						let nextVertex = vertices[i + 1];
						
						if (i == vertices.length-1) {
							let firstVertex = vertices[0];
							ctx.beginPath();
							ctx.moveTo(currentVertex.x, currentVertex.y);
							ctx.lineTo(firstVertex.x, firstVertex.y);
							ctx.stroke();
						} else {
							ctx.beginPath();
							ctx.moveTo(currentVertex.x, currentVertex.y);
							ctx.lineTo(nextVertex.x, nextVertex.y);
							ctx.stroke();
						}
					}
				}
			}
			break;
			
			case "GL_TRIANGLES": {
				if (vertices.length > 2) {
					for (let i = 0; i < Math.floor(vertices.length / 3); i++) {
						let firstVertex = vertices[i * 3];
						let secondVertex = vertices[i * 3 + 1];
						let thirdVertex = vertices[i * 3 + 2];

						ctx.beginPath();
						ctx.moveTo(firstVertex.x, firstVertex.y);
						ctx.lineTo(secondVertex.x, secondVertex.y);
						ctx.lineTo(thirdVertex.x, thirdVertex.y);
						ctx.lineTo(firstVertex.x, firstVertex.y);
						ctx.stroke();
						ctx.fill();
					}
				}
			}
			break;
			
			case "GL_TRIANGLE_FAN": {
				if (vertices.length > 2) {
					let firstVertex = vertices[0];
					let secondVertex = vertices[1];
					let thirdVertex = vertices[2];

					ctx.beginPath();
					ctx.moveTo(firstVertex.x, firstVertex.y);
					ctx.lineTo(secondVertex.x, secondVertex.y);
					ctx.lineTo(thirdVertex.x, thirdVertex.y);
					ctx.lineTo(firstVertex.x, firstVertex.y);
					ctx.fill();
					ctx.stroke();

					for (let i = 3; i < vertices.length; i++) {
						let prevVertex = vertices[i - 1];
						let currentVertex = vertices[i];

						ctx.beginPath();
						ctx.moveTo(prevVertex.x, prevVertex.y);
						ctx.lineTo(currentVertex.x, currentVertex.y);
						ctx.lineTo(firstVertex.x, firstVertex.y);
						ctx.fill();
						ctx.stroke();
					}
				}
			}
			break;
			
			case "GL_TRIANGLE_STRIP": {
				if (vertices.length > 2) {
					let firstVertex = vertices[0];
					let secondVertex = vertices[1];
					let thirdVertex = vertices[2];

					ctx.beginPath();
					ctx.moveTo(firstVertex.x, firstVertex.y);
					ctx.lineTo(secondVertex.x, secondVertex.y);
					ctx.lineTo(thirdVertex.x, thirdVertex.y);
					ctx.lineTo(firstVertex.x, firstVertex.y);
					ctx.fill();
					ctx.stroke();
					
					for (let i = 3; i < vertices.length; i++) {
						let prevPrevVertex = vertices[i - 2];
						let prevVertex = vertices[i - 1];
						let currentVertex = vertices[i];

						ctx.beginPath();
						ctx.moveTo(prevVertex.x, prevVertex.y);
						ctx.lineTo(currentVertex.x, currentVertex.y);
						ctx.lineTo(prevPrevVertex.x, prevPrevVertex.y);
						ctx.fill();
						ctx.stroke();
					}
				}
			}
			break;
			
			case "GL_QUADS": {
				if (vertices.length > 3) {
					for (let i = 0; i < Math.floor(vertices.length / 4); i++) {
						let firstVertex = vertices[i * 4];
						let secondVertex = vertices[i * 4 + 1];
						let thirdVertex = vertices[i * 4 + 2];
						let fourthVertex = vertices[i * 4 + 3];

						ctx.beginPath();
						ctx.moveTo(firstVertex.x, firstVertex.y);
						ctx.lineTo(secondVertex.x, secondVertex.y);
						ctx.lineTo(thirdVertex.x, thirdVertex.y);
						ctx.lineTo(fourthVertex.x, fourthVertex.y);
						ctx.lineTo(firstVertex.x, firstVertex.y);
						ctx.stroke();
						ctx.fill();
					}
				}
			}
			break;
			
			case "GL_POLYGON": {
				if (vertices.length > 2) {
					ctx.beginPath();
					
					let firstVertex = vertices[0];
					
					ctx.moveTo(firstVertex.x, firstVertex.y);
					
					for (let i = 0; i < vertices.length; i++) {
						let currentVertex = vertices[i];
						
						ctx.lineTo(currentVertex.x, currentVertex.y);
						ctx.fill();
						ctx.stroke();
					}
					
					ctx.lineTo(firstVertex.x, firstVertex.y);
					ctx.fill();
					ctx.stroke();
				}
			}
			break;
		}
    		
		requestAnimationFrame(redraw);
	})();
})();



