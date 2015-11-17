// rendercontext - gl interfaces
// Part of Stardazed TX
// (c) 2015 by Arthur Langereis - @zenmumbler

/// <reference path="../defs/webgl-ext.d.ts"/>
/// <reference path="pixelformat.ts"/>

namespace sd.render {

	export interface RenderContext {
		gl: WebGLRenderingContext;

		ext32bitIndexes: OESElementIndexUint;
		extDrawBuffers: WebGLDrawBuffers;
		extDepthTexture: WebGLDepthTexture;
		extS3TC: WebGLCompressedTextureS3TC;
		extMinMax: EXTBlendMinMax;
		extTexAnisotropy: EXTTextureFilterAnisotropic;
		extVAO: OESVertexArrayObject;
		extInstancedArrays: ANGLEInstancedArrays;
	}


	var contextLimits = {
		maxColourAttachments: 0,
		maxDrawBuffers: 0
	};


	export function maxColourAttachments(rc: RenderContext) {
		if (contextLimits.maxColourAttachments == 0) {
			contextLimits.maxColourAttachments = rc.extDrawBuffers ? rc.gl.getParameter(rc.extDrawBuffers.MAX_COLOR_ATTACHMENTS_WEBGL) : 1;
		}

		return contextLimits.maxColourAttachments;
	}


	export function maxDrawBuffers(rc: RenderContext) {
		if (contextLimits.maxDrawBuffers == 0) {
			contextLimits.maxDrawBuffers = rc.extDrawBuffers ? rc.gl.getParameter(rc.extDrawBuffers.MAX_DRAW_BUFFERS_WEBGL) : 1;
		}

		return contextLimits.maxDrawBuffers;
	}


	export function makeShader(rc: RenderContext, type: number, sourceText: string) {
		var shader = rc.gl.createShader(type);
		rc.gl.shaderSource(shader, sourceText);
		rc.gl.compileShader(shader);

		if (! rc.gl.getShaderParameter(shader, rc.gl.COMPILE_STATUS)) {
			var errorLog = rc.gl.getShaderInfoLog(shader);
			alert("COMPILE FAILED\n\n" + errorLog);
			console.error("Shader compilation failed:", errorLog);
			console.error("Source", sourceText);
			assert(false, "bad shader");
		}

		return shader;
	}


	export function makeProgram(rc: RenderContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
		var program = rc.gl.createProgram();
		if (vertexShader)
			rc.gl.attachShader(program, vertexShader);
		if (fragmentShader)
			rc.gl.attachShader(program, fragmentShader);
		rc.gl.linkProgram(program);

		if (! rc.gl.getProgramParameter(program, rc.gl.LINK_STATUS)) {
			var errorLog = rc.gl.getProgramInfoLog(program);
			alert("LINK FAILED\n\n" + errorLog);
			console.error("Program link failed:", errorLog);
			assert(false, "bad program");
		}

		return program;
	}
	

	export function makeRenderContext(canvas: HTMLCanvasElement): RenderContext {
		var gl: WebGLRenderingContext;

		// try and create the 3D context
		var contextAttrs: WebGLContextAttributes = {
			antialias: true
		};
		try {
			gl = canvas.getContext("webgl", contextAttrs);
			if (!gl)
				gl = canvas.getContext("experimental-webgl", contextAttrs);
		} catch (e) {
			gl = null;
		}
		if (!gl) {
			return null;
		}


		// enable large indexed meshes
		var eiu = gl.getExtension("OES_element_index_uint");

		// we'd like more colour attachments
		var mdb = gl.getExtension("WEBGL_draw_buffers");

		// enable extended depth textures
		var dte = gl.getExtension("WEBGL_depth_texture");
		dte = dte || gl.getExtension("WEBKIT_WEBGL_depth_texture");
		dte = dte || gl.getExtension("MOZ_WEBGL_depth_texture");

		// enable S3TC (desktop only)
		var s3tc = gl.getExtension("WEBGL_compressed_texture_s3tc");
		s3tc = s3tc || gl.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");
		s3tc = s3tc || gl.getExtension("MOZ_WEBGL_compressed_texture_s3tc");

		// enable MIN and MAX blend modes
		var bmm = gl.getExtension("EXT_blend_minmax");

		// enable texture anisotropy
		var txa = gl.getExtension("EXT_texture_filter_anisotropic");
		txa = txa || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");

		// enable Vertex Array Objects
		var vao = gl.getExtension("OES_vertex_array_object");

		// enable instanced draw calls
		var aia = gl.getExtension("ANGLE_instanced_arrays");


		// -- FIXME: Temporary setup
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.enable(gl.DEPTH_TEST);

		return {
			gl: gl,

			ext32bitIndexes: eiu,
			extDrawBuffers: mdb,
			extDepthTexture: dte,
			extS3TC: s3tc,
			extMinMax: bmm,
			extTexAnisotropy: txa,
			extVAO: vao,
			extInstancedArrays: aia
		};
	}

} // ns sd.render
