attribute vec2 vertex;
uniform vec2 offset;
uniform vec2 scale;

void main() {
	vec2 translated = (vertex + offset) * scale;
	gl_PointSize = 5.0;
	gl_Position = vec4(translated, 0, 1);
}