// render/pbr-prefilter - generate prefiltered environmental/reflective cube maps
// Part of Stardazed TX
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed-tx

namespace sd.render {

	const vertexSource = [
		"attribute vec2 vertexPos_model;",
		"varying vec2 vertexUV_intp;",
		"void main() {",
		"	gl_Position = vec4(vertexPos_model, 0.5, 1.0);",
		"	vertexUV_intp = vertexPos_model * 0.5 + 0.5;",
		"}"
	].join("\n");

	// This code is a combination of the sample code given in Epic Shading Course Notes by Brian Karis
	// http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf
	// and code from PlayCanvas by Arthur Rakhteenko
	// https://github.com/playcanvas/engine/blob/28100541996a74112b8d8cda4e0b653076e255a2/src/graphics/programlib/chunks/prefilterCubemap.ps
	function fragmentSource(rc: RenderContext, numSamples: number) {
		return [
			rc.extFragmentLOD ? "#extension GL_EXT_shader_texture_lod : require" : "",
			"precision highp float;",
			"varying vec2 vertexUV_intp;",
			"uniform vec4 params;", // face (0..5), roughness (0..1), dim, 0
			"uniform samplerCube envMapSampler;",
			`const int numSamples = ${numSamples};`,
			"const float PI = 3.141592654;",
			"float rnd(vec2 uv) {",
			"	return fract(sin(dot(uv, vec2(12.9898, 78.233) * 2.0)) * 43758.5453);",
			"}",
			"vec3 importanceSampleGGX(vec2 Xi, float roughness, vec3 N) {",
			"	float a = roughness * roughness;",
			"	float phi = 2.0 * PI * Xi.x;",
			"	float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));",
			"	float sinTheta = sqrt(1.0 - cosTheta * cosTheta);",
			"	vec3 H = vec3(",
			"		sinTheta * cos(phi),",
			"		sinTheta * sin(phi),",
			"		cosTheta",
			"	);",
			"	vec3 upVector = abs(N.z) < 0.999 ? vec3(0.0,0.0,1.0) : vec3(1.0,0.0,0.0);",
			"	vec3 tangentX = normalize(cross(upVector, N));",
			"	vec3 tangentY = cross(N, tangentX);",
			"	// Tangent to world space",
			"	return tangentX * H.x + tangentY * H.y + N * H.z;",
			"}",
			"vec3 prefilterEnvMap(float roughness, vec3 R) {",
			"	vec3 N = R;",
			"	vec3 V = R;",
			"	vec3 prefilteredColor = vec3(0.0);",
			"	float totalWeight = 0.0;",
			"	for (int i = 0; i < numSamples; i++) {",
			"		//vec2 Xi = hammersley(i, numSamples);",
			"		float sini = sin(float(i));",
			"		float cosi = cos(float(i));",
			"		float rand = rnd(vec2(sini, cosi));",
			"		vec2 Xi = vec2(float(i) / float(numSamples), rand);",
			"		vec3 H = importanceSampleGGX(Xi, roughness, N);",
			"		vec3 L = 2.0 * dot(V, H) * H - V;",
			"		float NoL = clamp(dot(N, L), 0.0, 1.0);",
			"		if (NoL > 0.0) {",
			rc.extFragmentLOD
				? "			prefilteredColor += textureCubeLodEXT(envMapSampler, L, 0.0).rgb * NoL;"
				: "			prefilteredColor += textureCube(envMapSampler, L).rgb * NoL;",
			"			totalWeight += NoL;",
			"		}",
			"	}",
			"	return prefilteredColor / totalWeight;",
			"}",
			"void main() {",
			"	float face = params.x;",
			"	float roughness = params.y;",
			"	float dim = params.z;",
			"	vec2 st = vertexUV_intp * 2.0 - 1.0;",
			// "	vec2 st = 2.0 * floor(gl_FragCoord.xy) / (dim - 1.0) - 1.0",
			"	vec3 R;",
			"	if (face == 0.0) {",
			"		R = vec3(1, -st.y, -st.x);",
			"	} else if (face == 1.0) {",
			"		R = vec3(-1, -st.y, st.x);",
			"	} else if (face == 2.0) {",
			"		R = vec3(st.x, 1, st.y);",
			"	} else if (face == 3.0) {",
			"		R = vec3(st.x, -1, -st.y);",
			"	} else if (face == 4.0) {",
			"		R = vec3(st.x, -st.y, 1);",
			"	} else {",
			"		R = vec3(-st.x, -st.y, -1);",
			"	}",
			"	gl_FragColor = vec4(prefilterEnvMap(roughness, R), 1.0);",
			"}",
		].join("\n");
	}


	interface PreFilterPipeline {
		pipeline: Pipeline;
		paramsUniform: WebGLUniformLocation;
		envMapSamplerUniform: WebGLUniformLocation;
	}

	const preFilterPipelines = new Map<number, PreFilterPipeline>();

	function getPipeline(rc: RenderContext, numSamples: number) {
		let pfp = preFilterPipelines.get(numSamples);
		if (! pfp) {
			pfp = <PreFilterPipeline>{};

			// -- pipeline
			const pld = makePipelineDescriptor();
			pld.vertexShader = makeShader(rc, rc.gl.VERTEX_SHADER, vertexSource);
			pld.fragmentShader = makeShader(rc, rc.gl.FRAGMENT_SHADER, fragmentSource(rc, numSamples));
			pld.attributeNames.set(meshdata.VertexAttributeRole.Position, "vertexPos_model");

			pfp.pipeline = new Pipeline(rc, pld);

			pfp.paramsUniform = rc.gl.getUniformLocation(pfp.pipeline.program, "params")!;
			pfp.envMapSamplerUniform = rc.gl.getUniformLocation(pfp.pipeline.program, "envMapSampler")!;
			assert(pfp.paramsUniform && pfp.envMapSamplerUniform, "invalid prefilter pipeline");

			// -- invariant uniform
			pfp.pipeline.bind();
			rc.gl.uniform1i(pfp.envMapSamplerUniform, 0);
			pfp.pipeline.unbind();

			preFilterPipelines.set(numSamples, pfp);
		}

		return pfp;
	}


	export function prefilteredEnvMap(rc: RenderContext, meshMgr: world.MeshManager, sourceEnvMap: Texture, numSamples: number) {
		const pipeline = getPipeline(rc, numSamples);

		const rpd = makeRenderPassDescriptor();
		rpd.clearMask = ClearMask.None;

		const baseWidth = 128; // this basewidth gives max 8 mip levels, 6 of which are used in pbrmodel.ts

		const resultMapDesc = makeTexDescCube(PixelFormat.RGBA8, baseWidth, UseMipMaps.Yes);
		const resultEnvMap = new render.Texture(rc, resultMapDesc);
		const mipCount = resultEnvMap.mipmaps;
		const resultGLPixelFormat = glImageFormatForPixelFormat(rc, resultEnvMap.pixelFormat);

		const levelWidths: number[] = [];
		for (let lmip = 0; lmip < mipCount; ++lmip) {
			levelWidths[lmip] = baseWidth >> lmip;
		}

		const roughnessTable: number[] = [];
		for (let ml = 0; ml < mipCount; ++ml) {
			let roughAtLevel = (1.0 / (mipCount - 1)) * ml;
			roughnessTable.push(roughAtLevel);
		}

		const quad = meshdata.gen.generate(new meshdata.gen.Quad(2, 2), [meshdata.attrPosition2(), meshdata.attrUV2()]);
		const quadMesh = meshMgr.create({ name: "squareQuad", meshData: quad }); // TODO: add baked-in box, screen quads etc

		const levelPixels: Uint8Array[] = [];
		const levelTextures: render.Texture[] = [];
		for (let mip = 0; mip < mipCount; ++mip) {
			const levelWidth = levelWidths[mip];
			const levelMapDesc = makeTexDesc2D(PixelFormat.RGBA8, levelWidth, levelWidth, UseMipMaps.No);
			levelTextures[mip] = new render.Texture(rc, levelMapDesc);
			levelPixels[mip] = new Uint8Array(levelWidth * levelWidth * 4);
		}

		for (let mip = 0; mip < mipCount; ++mip) {
			const levelWidth = levelWidths[mip];

			for (let face = 0; face < 6; ++face) {
				const fbd = makeFrameBufferDescriptor();
				fbd.colourAttachments[0].texture = levelTextures[mip];
				const fb = new FrameBuffer(rc, fbd);

				runRenderPass(rc, meshMgr, rpd, fb, (rp) => {
					rp.setPipeline(pipeline.pipeline);
					rp.setTexture(sourceEnvMap, 0);
					rp.setMesh(quadMesh);
					rp.setDepthTest(render.DepthTest.LessOrEqual);

					// supply filtering params
					rc.gl.uniform4fv(pipeline.paramsUniform, new Float32Array([face, roughnessTable[mip], levelWidth, 0]));

					// render quad without any transforms, filling full FB
					const primGroup0 = quad.primitiveGroups[0];
					rp.drawIndexedPrimitives(primGroup0.type, quad.indexBuffer!.indexElementType, 0, primGroup0.elementCount);

					// implicit glFinish, read back generated texture
					rc.gl.readPixels(0, 0, levelWidth, levelWidth, rc.gl.RGBA, rc.gl.UNSIGNED_BYTE, levelPixels[mip]);

					let err = rc.gl.getError();
					if (err) {
						assert(false, `Cannot read pixels, gl error: ${err}`);
					}
					else {
						// write generated pixels into result envmap at proper face/mip level
						resultEnvMap.bind();
						rc.gl.texImage2D(rc.gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, mip, resultGLPixelFormat, levelWidth, levelWidth, 0, rc.gl.RGBA, rc.gl.UNSIGNED_BYTE, levelPixels[mip]);
						err = rc.gl.getError();
						if (err) {
							assert(false, `Cannot write pixels, gl error: ${err}`);
						}
						resultEnvMap.unbind();
					}
				});
			}
		}

		return resultEnvMap;
	}

} // ns sd.render