// world/stdmodel - standard model component
// Part of Stardazed TX
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed-tx

namespace sd.world {

	const enum Features {
		// VtxPosition and VtxNormal are required
		VtxUV                      = 0x000001,
		VtxColour                  = 0x000002,

		Emissive                   = 0x000004,
		Specular                   = 0x000008, // Implied true if GlossMap
		SpecularMap                = 0x000010,

		DiffuseMap                 = 0x000020,
		DiffuseAlphaIsTransparency = 0x000040, // \__ 
		DiffuseAlphaIsOpacity      = 0x000080, // =__ Mutually Exclusive
		// DiffuseAlphaIsGloss        = 0x000100, // /

		NormalMap                  = 0x000200,
		// NormalAlphaIsHeight        = 0x000400,
		// HeightMap                  = 0x000800, // Either this or NormalMap + NormalAlphaIsHeight

		ShadowMap       = 0x001000,
		Fog             = 0x004000,
		Translucency    = 0x008000,

		// Instanced      = 0x010000,
		Skinned         = 0x020000
	}


	interface StdGLProgram extends WebGLProgram {
		// -- transform
		modelMatrixUniform: WebGLUniformLocation;      // mat4
		mvMatrixUniform: WebGLUniformLocation | null;  // mat4
		mvpMatrixUniform: WebGLUniformLocation;        // mat4
		normalMatrixUniform: WebGLUniformLocation;     // mat3

		// -- skinning
		jointDataUniform: WebGLUniformLocation | null;        // sampler2D 
		jointIndexOffsetUniform: WebGLUniformLocation | null; // int

		// -- mesh material
		mainColourUniform: WebGLUniformLocation;        // vec4
		specularUniform: WebGLUniformLocation;          // vec4
		emissiveDataUniform: WebGLUniformLocation;      // vec4
		texScaleOffsetUniform: WebGLUniformLocation;    // vec4

		colourMapUniform: WebGLUniformLocation | null;        // sampler2D
		normalMapUniform: WebGLUniformLocation | null;        // sampler2D
		specularMapUniform: WebGLUniformLocation | null;      // sampler2D

		// -- lights
		lightLUTUniform: WebGLUniformLocation | null;         // sampler2D
		lightLUTParamUniform: WebGLUniformLocation | null;    // vec4
		shadowCastingLightIndexUniform: WebGLUniformLocation | null; // int (0..32767)

		// -- shadow
		lightProjMatrixUniform: WebGLUniformLocation | null; // mat4
		lightViewMatrixUniform: WebGLUniformLocation | null; // mat4
		shadowMapUniform: WebGLUniformLocation | null;        // sampler2D/Cube

		// -- fog
		fogColourUniform: WebGLUniformLocation | null;        // vec4 (rgb, 0)
		fogParamsUniform: WebGLUniformLocation | null;        // vec4 (start, depth, density, 0)
	}


	interface ShadowProgram extends WebGLProgram {
		modelMatrixUniform: WebGLUniformLocation;       // mat4
		lightViewProjectionMatrixUniform: WebGLUniformLocation;   // mat4
		lightViewMatrixUniform: WebGLUniformLocation;         // mat4
	}


	const enum TextureBindPoint {
		Colour = 0, // rgb, (alpha|gloss)?
		Normal = 1, // xyz, height?
		Specular = 2,
		Shadow = 3,
		JointData = 4,
		LightLUT = 5
	}


	//  ___ _      _ ___ _           _ _          
	// / __| |_ __| | _ (_)_ __  ___| (_)_ _  ___ 
	// \__ \  _/ _` |  _/ | '_ \/ -_) | | ' \/ -_)
	// |___/\__\__,_|_| |_| .__/\___|_|_|_||_\___|
	//                    |_|                     

	class StdPipeline {
		private cachedPipelines_ = new Map<number, render.Pipeline>();
		private shadowPipeline_: render.Pipeline | null = null;
		private featureMask_: Features = 0x7fffffff;

		constructor(private rc: render.RenderContext) {
		}


		disableFeatures(disableMask: Features) {
			this.featureMask_ &= ~disableMask;
		}


		enableFeatures(disableMask: Features) {
			this.featureMask_ |= disableMask;
		}


		enableAllFeatures() {
			this.featureMask_ = 0x7fffffff;
		}


		pipelineForFeatures(feat: number) {
			feat &= this.featureMask_;

			const cached = this.cachedPipelines_.get(feat);
			if (cached) {
				return cached;
			}

			const gl = this.rc.gl;

			const vertexSource = this.vertexShaderSource(feat);
			const fragmentSource = this.fragmentShaderSource(feat);

			const pld = render.makePipelineDescriptor();
			pld.vertexShader = render.makeShader(this.rc, gl.VERTEX_SHADER, vertexSource);
			pld.fragmentShader = render.makeShader(this.rc, gl.FRAGMENT_SHADER, fragmentSource);

			// -- mandatory and optional attribute arrays
			pld.attributeNames.set(meshdata.VertexAttributeRole.Normal, "vertexNormal");

			if (feat & Features.Skinned) {
				pld.attributeNames.set(meshdata.VertexAttributeRole.JointIndexes, "vertexJointIndexes");
				pld.attributeNames.set(meshdata.VertexAttributeRole.WeightedPos0, "vertexWeightedPos0_joint");
				pld.attributeNames.set(meshdata.VertexAttributeRole.WeightedPos1, "vertexWeightedPos1_joint");
				pld.attributeNames.set(meshdata.VertexAttributeRole.WeightedPos2, "vertexWeightedPos2_joint");
				pld.attributeNames.set(meshdata.VertexAttributeRole.WeightedPos3, "vertexWeightedPos3_joint");
			}
			else {
				pld.attributeNames.set(meshdata.VertexAttributeRole.Position, "vertexPos_model");
			}
			if (feat & Features.VtxColour) {
				pld.attributeNames.set(meshdata.VertexAttributeRole.Colour, "vertexColour");
			}
			if (feat & Features.VtxUV) {
				pld.attributeNames.set(meshdata.VertexAttributeRole.UV, "vertexUV");
			}

			if (feat & Features.Translucency) {
				pld.depthMask = false;
				pld.blending.enabled = true;

				pld.blending.rgbBlendOp = render.BlendOperation.Add;
				pld.blending.alphaBlendOp = render.BlendOperation.Add;

				if (feat & Features.DiffuseAlphaIsOpacity) {
					pld.blending.sourceRGBFactor = render.BlendFactor.SourceAlpha;
					pld.blending.sourceAlphaFactor = render.BlendFactor.SourceAlpha;
					pld.blending.destRGBFactor = render.BlendFactor.OneMinusSourceAlpha;
					pld.blending.destAlphaFactor = render.BlendFactor.OneMinusSourceAlpha;
				}
				else {
					// fixed alpha value from Material
					pld.blending.sourceRGBFactor = render.BlendFactor.ConstantAlpha;
					pld.blending.sourceAlphaFactor = render.BlendFactor.ConstantAlpha;
					pld.blending.destRGBFactor = render.BlendFactor.OneMinusConstantAlpha;
					pld.blending.destAlphaFactor = render.BlendFactor.OneMinusConstantAlpha;

					pld.blending.constantColour[3] = 0.35;
				}
			}

			const pipeline = new render.Pipeline(this.rc, pld);
			const program = <StdGLProgram>pipeline.program;

			gl.useProgram(program);

			// -- transformation matrices
			program.modelMatrixUniform = gl.getUniformLocation(program, "modelMatrix")!;
			program.mvMatrixUniform = gl.getUniformLocation(program, "modelViewMatrix");
			program.mvpMatrixUniform = gl.getUniformLocation(program, "modelViewProjectionMatrix")!;
			program.normalMatrixUniform = gl.getUniformLocation(program, "normalMatrix")!;

			// -- material properties
			program.mainColourUniform = gl.getUniformLocation(program, "mainColour")!;
			program.specularUniform = gl.getUniformLocation(program, "specular")!;
			program.emissiveDataUniform = gl.getUniformLocation(program, "emissiveData")!;
			program.texScaleOffsetUniform = gl.getUniformLocation(program, "texScaleOffset")!;

			// -- texture samplers and their fixed binding indexes
			program.colourMapUniform = gl.getUniformLocation(program, "diffuseSampler");
			if (program.colourMapUniform) {
				gl.uniform1i(program.colourMapUniform, TextureBindPoint.Colour);
			}
			program.normalMapUniform = gl.getUniformLocation(program, "normalSampler");
			if (program.normalMapUniform) {
				gl.uniform1i(program.normalMapUniform, TextureBindPoint.Normal);
			}
			program.specularMapUniform = gl.getUniformLocation(program, "specularSampler");
			if (program.specularMapUniform) {
				gl.uniform1i(program.specularMapUniform, TextureBindPoint.Specular);
			}
			program.shadowMapUniform = gl.getUniformLocation(program, "shadowSampler");
			if (program.shadowMapUniform) {
				gl.uniform1i(program.shadowMapUniform, TextureBindPoint.Shadow);
			}

			// -- vertex skinning data
			program.jointDataUniform = gl.getUniformLocation(program, "jointData");
			program.jointIndexOffsetUniform = gl.getUniformLocation(program, "jointIndexOffset");
			if (program.jointDataUniform) {
				gl.uniform1i(program.jointDataUniform, TextureBindPoint.JointData);
				gl.uniform1i(program.jointIndexOffsetUniform, 0);
			}

			// -- light data texture and associated properties
			program.lightLUTUniform = gl.getUniformLocation(program, "lightLUTSampler");
			if (program.lightLUTUniform) {
				gl.uniform1i(program.lightLUTUniform, TextureBindPoint.LightLUT);
			}

			program.lightLUTParamUniform = gl.getUniformLocation(program, "lightLUTParam");

			// -- shadow properties
			program.shadowCastingLightIndexUniform = gl.getUniformLocation(program, "shadowCastingLightIndex");
			if (program.shadowCastingLightIndexUniform) {
				// if this exists, init to -1 to signify no shadow caster
				gl.uniform1i(program.shadowCastingLightIndexUniform, -1);
			}
			program.shadowMapUniform = gl.getUniformLocation(program, "shadowSampler");
			if (program.shadowMapUniform) {
				gl.uniform1i(program.shadowMapUniform, TextureBindPoint.Shadow);
			}
			program.lightProjMatrixUniform = gl.getUniformLocation(program, "lightProjMatrix");
			program.lightViewMatrixUniform = gl.getUniformLocation(program, "lightViewMatrix");


			// -- fog properties
			program.fogColourUniform = gl.getUniformLocation(program, "fogColour");
			program.fogParamsUniform = gl.getUniformLocation(program, "fogParams");

			gl.useProgram(null);

			this.cachedPipelines_.set(feat, pipeline);
			return pipeline;
		}


		shadowPipeline() {
			if (this.shadowPipeline_ == null) {
				const pld = render.makePipelineDescriptor();
				pld.vertexShader = render.makeShader(this.rc, this.rc.gl.VERTEX_SHADER, this.shadowVertexSource);
				pld.fragmentShader = render.makeShader(this.rc, this.rc.gl.FRAGMENT_SHADER, this.shadowFragmentSource);
				pld.attributeNames.set(meshdata.VertexAttributeRole.Position, "vertexPos_model");

				this.shadowPipeline_ = new render.Pipeline(this.rc, pld);

				const program = this.shadowPipeline_.program as ShadowProgram;
				program.modelMatrixUniform = this.rc.gl.getUniformLocation(program, "modelMatrix")!;
				program.lightViewProjectionMatrixUniform = this.rc.gl.getUniformLocation(program, "lightViewProjectionMatrix")!;
				program.lightViewMatrixUniform = this.rc.gl.getUniformLocation(program, "lightViewMatrix")!;
			}

			return this.shadowPipeline_;
		}


		private shadowVertexSource = `
			attribute vec3 vertexPos_model;

			varying vec4 vertexPos_world;

			uniform mat4 modelMatrix;
			uniform mat4 lightViewProjectionMatrix;

			void main() {
				vertexPos_world = modelMatrix * vec4(vertexPos_model, 1.0);
				gl_Position = lightViewProjectionMatrix * vertexPos_world;
			}
		`.trim();


		private shadowFragmentSource = `
			#extension GL_OES_standard_derivatives : enable
			precision highp float;

			varying vec4 vertexPos_world;

			uniform mat4 lightViewMatrix;

			void main() {
				vec3 lightPos = (lightViewMatrix * vertexPos_world).xyz;
				float depth = clamp(length(lightPos) / 12.0, 0.0, 1.0);
				float dx = dFdx(depth);
				float dy = dFdy(depth);
				gl_FragColor = vec4(depth, depth * depth + 0.25 * (dx * dy + dy * dy), 0.0, 1.0);
			}
		`.trim();


		private vertexShaderSource(feat: number) {
			const source: string[] = [];
			const line = (s: string) => source.push(s);

			/* tslint:disable:variable-name */
			const if_all = (s: string, f: number) => { if ((feat & f) == f) { source.push(s); } };
			// const if_any = (s: string, f: number) => { if ((feat & f) != 0) source.push(s) };
			/* tslint:enable:variable-name */

			// In
			if (feat & Features.Skinned) {
				line("attribute vec4 vertexWeightedPos0_joint;");
				line("attribute vec4 vertexWeightedPos1_joint;");
				line("attribute vec4 vertexWeightedPos2_joint;");
				line("attribute vec4 vertexWeightedPos3_joint;");
				line("attribute vec4 vertexJointIndexes;");
			}
			else {
				line("attribute vec3 vertexPos_model;");
			}
			line  ("attribute vec3 vertexNormal;");
			if_all("attribute vec2 vertexUV;", Features.VtxUV);
			if_all("attribute vec3 vertexColour;", Features.VtxColour);

			// Out
			line  ("varying vec3 vertexNormal_cam;");
			line  ("varying vec4 vertexPos_world;");
			line  ("varying vec3 vertexPos_cam;");
			if_all("varying vec2 vertexUV_intp;", Features.VtxUV);
			if_all("varying vec3 vertexColour_intp;", Features.VtxColour);

			// Uniforms
			line  ("uniform mat4 modelMatrix;");
			line  ("uniform mat4 modelViewMatrix;");
			line  ("uniform mat4 modelViewProjectionMatrix;");
			line  ("uniform mat3 normalMatrix;");

			if_all("uniform vec4 texScaleOffset;", Features.VtxUV);

			if_all("uniform sampler2D jointData;", Features.Skinned);
			if_all("uniform int jointIndexOffset;", Features.Skinned);


			// Joint structure and getIndexedJoint() getter
			if (feat & Features.Skinned) {
				// transformQuat converted from gl-matrix original
				line("vec3 transformQuat(vec3 a, vec4 q) {");
				line("	float ix = q.w * a.x + q.y * a.z - q.z * a.y;");
				line("	float iy = q.w * a.y + q.z * a.x - q.x * a.z;");
				line("	float iz = q.w * a.z + q.x * a.y - q.y * a.x;");
				line("	float iw = -q.x * a.x - q.y * a.y - q.z * a.z;");
				line("	vec3 result;");
				line("	result.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;");
				line("	result.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;");
				line("	result.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;");
				line("	return result;");
				line("}");

				line("struct Joint {");
				line("	vec4 rotation_joint;");
				line("	mat4 transform_model;");
				line("};");

				// The jointData texture is 256x256 xyzw texels.
				// Each joint takes up 8 texels that contain the Joint structure data
				// The sampler must be set up with nearest neighbour filtering and have no mipmaps
				line("Joint getIndexedJoint(float jointIndex) {");
				// line("	jointIndex += float(jointIndexOffset);");
				line("	float row = (floor(jointIndex / 32.0) + 0.5) / 256.0;");
				line("	float col = (mod(jointIndex, 32.0) * 8.0) + 0.5;");
				line("	Joint j;");
				line("	j.rotation_joint = texture2D(jointData, vec2(col / 256.0, row));");
				// rows 1,2,3 are reserved
				line("	j.transform_model[0] = texture2D(jointData, vec2((col + 4.0) / 256.0, row));");
				line("	j.transform_model[1] = texture2D(jointData, vec2((col + 5.0) / 256.0, row));");
				line("	j.transform_model[2] = texture2D(jointData, vec2((col + 6.0) / 256.0, row));");
				line("	j.transform_model[3] = texture2D(jointData, vec2((col + 7.0) / 256.0, row));");
				line("	return j;");
				line("}");
			}

			// main()
			line  ("void main() {");

			if (feat & Features.Skinned) {
				line("	vec3 vertexPos_model = vec3(0.0);");
				line("	vec3 vertexNormal_final = vec3(0.0);");

				line("	vec4 weightedPos_joint[4];");
				line("	weightedPos_joint[0] = vertexWeightedPos0_joint;");
				line("	weightedPos_joint[1] = vertexWeightedPos1_joint;");
				line("	weightedPos_joint[2] = vertexWeightedPos2_joint;");
				line("	weightedPos_joint[3] = vertexWeightedPos3_joint;");

				line("	for (int vji = 0; vji < 4; ++vji) {");
				line("		float jointIndex = vertexJointIndexes[vji];");
				line("		if (jointIndex >= 0.0) {");
				line("			Joint j = getIndexedJoint(jointIndex);");
				line("			vec4 weightedPos = weightedPos_joint[vji];");
				line("			vec3 tempPos = (j.transform_model * vec4(weightedPos.xyz, 1.0)).xyz;");
				line("			vertexPos_model += tempPos * weightedPos.w;");
				//              normal += ( joint.m_Orient * vert.m_Normal ) * weight.m_Bias;
				line("			vec3 vertexNormal_joint = transformQuat(vertexNormal, j.rotation_joint);");
				line("			vertexNormal_final += vertexNormal_joint * weightedPos.w;");
				line("		}");
				line("	}");
				line("	vertexNormal_final = normalize(vertexNormal_final);");
				// line("	vertexNormal_final = vertexNormal;");
			}
			else {
				line("	vec3 vertexNormal_final = vertexNormal;");
			}

			line  ("	gl_Position = modelViewProjectionMatrix * vec4(vertexPos_model, 1.0);");
			line  ("	vertexPos_world = modelMatrix * vec4(vertexPos_model, 1.0);");
			line  ("	vertexNormal_cam = normalMatrix * vertexNormal_final;");
			line  ("	vertexPos_cam = (modelViewMatrix * vec4(vertexPos_model, 1.0)).xyz;");
			if_all("	vertexUV_intp = (vertexUV * texScaleOffset.xy) + texScaleOffset.zw;", Features.VtxUV);
			if_all("	vertexColour_intp = vertexColour;", Features.VtxColour);
			line  ("}");

			// console.info("------ VERTEX");
			// console.info(source.map((l, ix) => (ix + 1) + ": " + l).join("\n") + "\n");

			return source.join("\n") + "\n";
		}


		private fragmentShaderSource(feat: number) {
			const source: string[] = [];
			const line = (s: string) => source.push(s);

			/* tslint:disable:variable-name */
			const if_all = (s: string, f: number) => { if ((feat & f) == f) { source.push(s); } };
			// const if_any = (s: string, f: number) => { if ((feat & f) != 0) source.push(s) };
			// const if_not = (s: string, f: number) => { if ((feat & f) == 0) source.push(s) };
			/* tslint:enable:variable-name */

			if_all("#extension GL_OES_standard_derivatives : require", Features.NormalMap);
			line  ("precision highp float;");

			// In
			line  ("varying vec4 vertexPos_world;");
			line  ("varying vec3 vertexNormal_cam;");
			line  ("varying vec3 vertexPos_cam;");
			if_all("varying vec2 vertexUV_intp;", Features.VtxUV);
			if_all("varying vec3 vertexColour_intp;", Features.VtxColour);

			// -- material
			line  ("uniform vec4 mainColour;");
			if_all("uniform vec4 specular;", Features.Specular);
			if_all("uniform vec4 emissiveData;", Features.Emissive);
			if_all("uniform sampler2D diffuseSampler;", Features.DiffuseMap);
			if_all("uniform sampler2D normalSampler;", Features.NormalMap);
			if_all("uniform sampler2D specularSampler;", Features.SpecularMap);

			// -- shadow
			if_all("uniform mat4 lightViewMatrix;", Features.ShadowMap);
			if_all("uniform mat4 lightProjMatrix;", Features.ShadowMap);
			if_all("uniform sampler2D shadowSampler;", Features.ShadowMap);
			if_all("uniform int shadowCastingLightIndex;", Features.ShadowMap);

			line  ("const int SPEC_INTENSITY = 0;");
			line  ("const int SPEC_EXPONENT = 1;");

			// -- light data
			line  ("uniform sampler2D lightLUTSampler;");
			line  ("uniform vec2 lightLUTParam;");

			// -- fog
			if (feat & Features.Fog) {
				line("const int FOGPARAM_START = 0;");
				line("const int FOGPARAM_DEPTH = 1;");
				line("const int FOGPARAM_DENSITY = 2;");

				line("uniform vec4 fogColour;");
				line("uniform vec4 fogParams;");
			}


			// -- LightEntry and getLightData()
			line  ("struct LightEntry {");
			line  ("	vec4 colourAndType;");
			line  ("	vec4 positionCamAndIntensity;");
			line  ("	vec4 positionWorldAndRange;");
			line  ("	vec4 directionAndCutoff;");
			line  ("	vec4 shadowStrengthBias;");
			line  ("};");

			// -- getLightEntry()
			line  ("LightEntry getLightEntry(float lightIx) {");
			line  (`	float row = (floor(lightIx / 128.0) + 0.5) / 512.0;`);
			line  (`	float col = (mod(lightIx, 128.0) * 5.0) + 0.5;`);
			line  ("	LightEntry le;");
			line  ("	le.colourAndType = texture2D(lightLUTSampler, vec2(col / 640.0, row));");
			line  ("	le.positionCamAndIntensity = texture2D(lightLUTSampler, vec2((col + 1.0) / 640.0, row));");
			line  ("	le.positionWorldAndRange = texture2D(lightLUTSampler, vec2((col + 2.0) / 640.0, row));");
			line  ("	le.directionAndCutoff = texture2D(lightLUTSampler, vec2((col + 3.0) / 640.0, row));");
			line  ("	le.shadowStrengthBias = texture2D(lightLUTSampler, vec2((col + 4.0) / 640.0, row));");
			line  ("	return le;");
			line  ("}");

			// -- getLightIndex()
			line  ("float getLightIndex(float listIndex) {");
			line  (`	float liRow = (floor(listIndex / 2560.0) + 256.0 + 0.5) / 512.0;`);
			line  (`	float rowElementIndex = mod(listIndex, 2560.0);`);
			line  (`	float liCol = (floor(rowElementIndex / 4.0) + 0.5) / 640.0;`);
			line  (`	float element = floor(mod(rowElementIndex, 4.0));`);
			line  ("	vec4 packedIndices = texture2D(lightLUTSampler, vec2(liCol, liRow));");
			// gles2: only constant index accesses allowed
			line  ("	if (element < 1.0) return packedIndices[0];");
			line  ("	if (element < 2.0) return packedIndices[1];");
			line  ("	if (element < 3.0) return packedIndices[2];");
			line  ("	return packedIndices[3];");
			line  ("}");

			// -- getLightGridCell()
			line  ("vec2 getLightGridCell(vec2 fragCoord) {");
			line  ("	vec2 lightGridPos = vec2(floor(fragCoord.x / 32.0), floor(fragCoord.y / 32.0));");
			line  ("	float lightGridIndex = (lightGridPos.y * lightLUTParam.x) + lightGridPos.x;");

			line  (`	float lgRow = (floor(lightGridIndex / 1280.0) + 256.0 + 240.0 + 0.5) / 512.0;`);
			line  (`	float rowPairIndex = mod(lightGridIndex, 1280.0);`);
			line  (`	float lgCol = (floor(rowPairIndex / 2.0) + 0.5) / 640.0;`);
			line  (`	float pair = floor(mod(rowPairIndex, 2.0));`);
			// gles2: only constant index accesses allowed
			line  ("	vec4 cellPair = texture2D(lightLUTSampler, vec2(lgCol, lgRow));");
			line  ("	if (pair < 1.0) return cellPair.xy;");
			line  ("	return cellPair.zw;");
			line  ("}");


			// -- calcLightShared()
			line  ("vec3 calcLightShared(vec3 lightColour, float intensity, float diffuseStrength, vec3 lightDirection, vec3 normal_cam) {");
			line  ("	float NdL = max(0.0, dot(normal_cam, -lightDirection));");
			line  ("	vec3 diffuseContrib = lightColour * diffuseStrength * NdL * intensity;");

			if (feat & Features.Specular) {
				line("	vec3 specularContrib = vec3(0.0);");
				line("	vec3 viewVec = normalize(-vertexPos_cam);");
				line("	vec3 reflectVec = reflect(lightDirection, normal_cam);");
				line("	float specularStrength = dot(viewVec, reflectVec);");
				line("	if (specularStrength > 0.0) {");
				if (feat & Features.SpecularMap) {
					line("		vec3 specularColour = texture2D(specularSampler, vertexUV_intp).xyz;");
				}
				else {
					line("		vec3 specularColour = lightColour;");
				}
				line("		specularStrength = pow(specularStrength, specular[SPEC_EXPONENT]) * diffuseStrength;"); // FIXME: not too sure about this (* diffuseStrength)
				line("		specularContrib = specularColour * specularStrength * specular[SPEC_INTENSITY];");
				line("	}");
				line("	return diffuseContrib + specularContrib;");
			}
			else {
				line("	return diffuseContrib;");
			}
			line  ("}");


			// -- calcPointLight()
			line  ("vec3 calcPointLight(vec3 lightColour, float intensity, float range, vec3 lightPos_cam, vec3 lightPos_world, vec3 normal_cam) {");
			line  ("	float distance = length(vertexPos_world.xyz - lightPos_world);"); // use world positions for distance as cam will warp coords
			line  ("	vec3 lightDirection_cam = normalize(vertexPos_cam - lightPos_cam);");
			line  ("	float attenuation = clamp(1.0 - distance / range, 0.0, 1.0);");
			line  ("	attenuation *= attenuation;");
			line  ("	return calcLightShared(lightColour, intensity, attenuation, lightDirection_cam, normal_cam);");
			line  ("}");

			// -- calcSpotLight()
			line  ("vec3 calcSpotLight(vec3 lightColour, float intensity, float range, float cutoff, vec3 lightPos_cam, vec3 lightPos_world, vec3 lightDirection, vec3 normal_cam) {");
			line  ("	vec3 lightToPoint = normalize(vertexPos_cam - lightPos_cam);");
			line  ("	float spotCosAngle = dot(lightToPoint, lightDirection);");
			line  ("	if (spotCosAngle > cutoff) {");
			line  ("		vec3 light = calcPointLight(lightColour, intensity, range, lightPos_cam, lightPos_world, normal_cam);");
			line  ("		return light * smoothstep(cutoff, cutoff + 0.006, spotCosAngle);");
			line  ("	}");
			line  ("	return vec3(0.0);");
			line  ("}");

			// -- getLightContribution()
			line  ("vec3 getLightContribution(LightEntry light, vec3 normal_cam) {");
			line  ("	vec3 colour = light.colourAndType.xyz;");
			line  ("	float type = light.colourAndType.w;");
			line  ("	vec3 lightPos_cam = light.positionCamAndIntensity.xyz;");
			line  ("	float intensity = light.positionCamAndIntensity.w;");

			line  (`	if (type == ${asset.LightType.Directional}.0) {`);
			line  ("		return calcLightShared(colour, intensity, 1.0, light.directionAndCutoff.xyz, normal_cam);");
			line  ("	}");

			line  ("	vec3 lightPos_world = light.positionWorldAndRange.xyz;");
			line  ("	float range = light.positionWorldAndRange.w;");
			line  (`	if (type == ${asset.LightType.Point}.0) {`);
			line  ("		return calcPointLight(colour, intensity, range, lightPos_cam, lightPos_world, normal_cam);");
			line  ("	}");

			line  ("	float cutoff = light.directionAndCutoff.w;");
			line  (`	if (type == ${asset.LightType.Spot}.0) {`);
			line  ("		return calcSpotLight(colour, intensity, range, cutoff, lightPos_cam, lightPos_world, light.directionAndCutoff.xyz, normal_cam);");
			line  ("	}");

			line  ("	return vec3(0.0);"); // this would be bad
			line  ("}");


			// -- normal perturbation
			if (feat & Features.NormalMap) {
				line("mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {");
				line("	// get edge vectors of the pixel triangle");
				line("	vec3 dp1 = dFdx(p);");
				line("	vec3 dp2 = dFdy(p);");
				line("	vec2 duv1 = dFdx(uv);");
				line("	vec2 duv2 = dFdy(uv);");
				line("	// solve the linear system");
				line("	vec3 dp2perp = cross(dp2, N);");
				line("	vec3 dp1perp = cross(N, dp1);");
				line("	vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;");
				line("	vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;");
				line("	// construct a scale-invariant frame ");
				line("	float invmax = inversesqrt(max(dot(T, T), dot(B, B)));");
				line("	return mat3(T * invmax, B * invmax, N);");
				line("}");

				line("vec3 perturbNormal(vec3 N, vec3 V, vec2 uv) {");
				line("	// assume N, the interpolated vertex normal and ");
				line("	// V, the view vector (vertex to eye)");
				line("	vec3 map = texture2D(normalSampler, uv).xyz * 2.0 - 1.0;");
				line("	map.y = -map.y;");
				line("	mat3 TBN = cotangentFrame(N, V, uv);");
				line("	return normalize(TBN * map);");
				line("}");
			}


			if (feat & Features.ShadowMap) {
				line(`
					float linstep(float low, float high, float v) {
						return clamp((v-low) / (high-low), 0.0, 1.0);
					}

					float VSM(vec2 uv, float compare, float strength, float bias) {
						vec2 moments = texture2D(shadowSampler, uv).xy;
						float p = smoothstep(compare - bias, compare, moments.x);
						float variance = max(moments.y - moments.x*moments.x, -0.001);
						float d = compare - moments.x;
						float p_max = linstep(0.2, 1.0, variance / (variance + d*d));
						return clamp(max(p, p_max), 0.0, 1.0);
					}
				`);
			}


			// main()
			line  ("void main() {");
			line  ("	float fragOpacity = 1.0;");

			// -- material colour at point
			if (feat & Features.DiffuseMap) {
				if (feat & (Features.DiffuseAlphaIsTransparency | Features.DiffuseAlphaIsOpacity)) {
					line("	vec4 texColourA = texture2D(diffuseSampler, vertexUV_intp);");
					line("	vec3 texColour = texColourA.rgb;");

					if (feat & Features.DiffuseAlphaIsTransparency) {
						line("	if (texColourA.a < 0.1) {");
						line("		discard;");
						line("	}");
					}
					else {
						line("	fragOpacity = texColourA.a;");
					}
				}
				else {
					line("	vec3 texColour = texture2D(diffuseSampler, vertexUV_intp).xyz;");
				}

				if (feat & Features.VtxColour) {
					line("	vec3 matColour = vertexColour_intp * texColour * mainColour.rgb;");
				}
				else {
					line("	vec3 matColour = texColour * mainColour.rgb;");
				}
			}
			else if (feat & Features.VtxColour) {
				line("	vec3 matColour = vertexColour_intp * mainColour.rgb;");
			}
			else {
				line("	vec3 matColour = mainColour.rgb;");
			}

			// -- normal in camera space, convert from tangent space
			line  ("	vec3 normal_cam = normalize(vertexNormal_cam);");
			if_all("	normal_cam = perturbNormal(normal_cam, vertexPos_cam, vertexUV_intp);", Features.NormalMap);

			// -- calculate light arriving at the fragment
			line  ("	vec3 totalLight = vec3(0.0);");
			if (feat & Features.Emissive) {
				line("	totalLight += (emissiveData.rgb * emissiveData.w);");
			}

			line  ("	vec2 fragCoord = vec2(gl_FragCoord.x, lightLUTParam.y - gl_FragCoord.y);");
			line  ("	vec2 lightOffsetCount = getLightGridCell(fragCoord);");
			line  ("	int lightListOffset = int(lightOffsetCount.x);");
			line  ("	int lightListCount = int(lightOffsetCount.y);");

			line  ("	for (int llix = 0; llix < 128; ++llix) {");
			line  ("		if (llix == lightListCount) break;"); // hack to overcome gles2 limitation where loops need constant max counters 

			line  ("		float lightIx = getLightIndex(float(lightListOffset + llix));");
			line  ("		LightEntry lightData = getLightEntry(lightIx);");
			line  ("		if (lightData.colourAndType.w <= 0.0) break;");

			line  ("		float shadowFactor = 1.0;");
			if (feat & Features.ShadowMap) {
				line("		if (int(lightIx) == shadowCastingLightIndex) {");
				line("			float shadowStrength = lightData.shadowStrengthBias.x;");
				line("			float shadowBias = lightData.shadowStrengthBias.y;");

				line("			vec3 lightPos = (lightViewMatrix * vertexPos_world).xyz;");
				line("			vec4 lightDevice = lightProjMatrix * vec4(lightPos, 1.0);");
				line("			vec2 lightDeviceNormal = lightDevice.xy / lightDevice.w;");
				line("			vec2 lightUV = lightDeviceNormal * 0.5 + 0.5;");
				line("			float lightTest = clamp(length(lightPos) / 12.0, 0.0, 1.0);");
				line("			shadowFactor = VSM(lightUV, lightTest, shadowStrength, shadowBias);");
				line("		}");
			}

			line  ("		totalLight += getLightContribution(lightData, normal_cam) * shadowFactor;");
			line  ("	}");

			// -- final colour result
			if (feat & Features.Fog) {
				line("	float fogDensity = clamp((length(vertexPos_cam) - fogParams[FOGPARAM_START]) / fogParams[FOGPARAM_DEPTH], 0.0, fogParams[FOGPARAM_DENSITY]);");
				line("	totalLight = mix(totalLight * matColour, fogColour.rgb, fogDensity);");
				// line("	fragOpacity = 1.0;"); // TODO: make Fog and translucency mut.ex.
			}
			else {
				line("	totalLight = totalLight * matColour;");
			}

			// -- final lightColour result
			line  ("	gl_FragColor = vec4(pow(totalLight, vec3(1.0 / 2.2)), fragOpacity);");
			line  ("}");

			// console.info(`------ FRAGMENT ${feat}`);
			// console.info(source.map((l, ix) => (ix + 1) + ": " + l).join("\n") + "\n");

			return source.join("\n") + "\n";
		}
	}


	//  ___ _      _ __  __         _     _ __  __                             
	// / __| |_ __| |  \/  |___  __| |___| |  \/  |__ _ _ _  __ _ __ _ ___ _ _ 
	// \__ \  _/ _` | |\/| / _ \/ _` / -_) | |\/| / _` | ' \/ _` / _` / -_) '_|
	// |___/\__\__,_|_|  |_\___/\__,_\___|_|_|  |_\__,_|_||_\__,_\__, \___|_|  
	//                                                           |___/         

	export type StdModelInstance = Instance<StdModelManager>;
	export type StdModelRange = InstanceRange<StdModelManager>;
	export type StdModelSet = InstanceSet<StdModelManager>;
	export type StdModelIterator = InstanceIterator<StdModelManager>;
	export type StdModelArrayView = InstanceArrayView<StdModelManager>;


	export interface StdModelDescriptor {
		materials: asset.Material[];
		castsShadows?: boolean;
		acceptsShadows?: boolean;
	}


	export const enum RenderMode {
		Forward,
		// Deferred,
		Shadow
	}


	export const enum RenderFeature {
		AlbedoMaps,
		NormalMaps,
		HeightMaps,
		Emissive
	}


	export class StdModelManager implements Component<StdModelManager> {
		private stdPipeline_: StdPipeline;
		private materialMgr_: StdMaterialManager;

		private instanceData_: container.MultiArrayBuffer;
		private entityBase_: EntityArrayView;
		private transformBase_: TransformArrayView;
		private enabledBase_: Uint8Array;
		private shadowFlagBase_: Int32Array;
		private materialOffsetCountBase_: Int32Array;
		private primGroupOffsetBase_: Int32Array;

		private materials_: StdMaterialInstance[];

		private primGroupData_: container.MultiArrayBuffer;
		private primGroupMaterialBase_: StdMaterialArrayView;
		private primGroupFeatureBase_: ConstEnumArrayView<Features>;

		// -- for light uniform updates
		private shadowCastingLightIndex_: LightInstance = 0;

		// -- for temp calculations
		private modelViewMatrix_ = mat4.create();
		private modelViewProjectionMatrix_ = mat4.create();
		private normalMatrix_ = mat3.create();


		constructor(
			private rc: render.RenderContext,
			private transformMgr_: Transform,
			private meshMgr_: MeshManager,
			private skeletonMgr_: SkeletonManager,
			private lightMgr_: LightManager
		)
		{
			this.stdPipeline_ = new StdPipeline(rc);
			this.materialMgr_ = new StdMaterialManager();

			const instFields: container.MABField[] = [
				{ type: SInt32, count: 1 }, // entity
				{ type: SInt32, count: 1 }, // transform
				{ type: UInt8,  count: 1 }, // enabled
				{ type: SInt32, count: 1 }, // shadowFlags
				{ type: SInt32, count: 1 }, // materialOffsetCount ([0]: offset, [1]: count)
				{ type: SInt32, count: 1 }, // primGroupOffset (offset into primGroupMaterials_ and primGroupFeatures_)
			];
			this.instanceData_ = new container.MultiArrayBuffer(1024, instFields);

			const groupFields: container.MABField[] = [
				{ type: SInt32, count: 1 }, // material
				{ type: SInt32, count: 1 }, // features
			];
			this.primGroupData_ = new container.MultiArrayBuffer(2048, groupFields);

			this.rebase();
			this.groupRebase();

			this.materials_ = [];
		}


		private rebase() {
			this.entityBase_ = this.instanceData_.indexedFieldView(0);
			this.transformBase_ = this.instanceData_.indexedFieldView(1);
			this.enabledBase_ = this.instanceData_.indexedFieldView(2);
			this.shadowFlagBase_ = this.instanceData_.indexedFieldView(3);
			this.materialOffsetCountBase_ = this.instanceData_.indexedFieldView(4);
			this.primGroupOffsetBase_ = this.instanceData_.indexedFieldView(5);
		}


		private groupRebase() {
			this.primGroupMaterialBase_ = this.primGroupData_.indexedFieldView(0);
			this.primGroupFeatureBase_ = this.primGroupData_.indexedFieldView(1);
		}


		private featuresForMeshAndMaterial(mesh: MeshInstance, material: StdMaterialInstance): Features {
			let features = 0;

			const meshFeatures = this.meshMgr_.features(mesh);
			if (meshFeatures & MeshFeatures.VertexColours) { features |= Features.VtxColour; }
			if (meshFeatures & MeshFeatures.VertexUVs) { features |= Features.VtxUV; }

			const matFlags = this.materialMgr_.flags(material);
			if (matFlags & asset.MaterialFlags.usesSpecular) { features |= Features.Specular; }
			if (matFlags & asset.MaterialFlags.usesEmissive) { features |= Features.Emissive; }
			if (matFlags & asset.MaterialFlags.diffuseAlphaIsTransparency) { features |= Features.DiffuseAlphaIsTransparency; }

			if (matFlags & asset.MaterialFlags.isTranslucent) {
				features |= Features.Translucency;

				if (matFlags & asset.MaterialFlags.diffuseAlphaIsOpacity) {
					features |= Features.DiffuseAlphaIsOpacity;
				}
			}

			if (this.materialMgr_.diffuseMap(material)) { features |= Features.DiffuseMap; }
			if (this.materialMgr_.normalMap(material)) { features |= Features.NormalMap; }
			if (this.materialMgr_.specularMap(material)) { features |= Features.SpecularMap | Features.Specular; }

			if (this.materialMgr_.flags(material) & asset.MaterialFlags.isSkinned) { features |= Features.Skinned; }

			// Remove redundant or unused features as GL drivers can and will remove attributes that are only used in the vertex shader
			// const prePrune = features;

			// disable UV attr and DiffuseMap unless both are provided (TODO: also take other maps into account when added later)
			if ((features & (Features.VtxUV | Features.DiffuseMap)) != (Features.VtxUV | Features.DiffuseMap)) {
				features &= ~(Features.VtxUV | Features.DiffuseMap);
			}

			// disable diffusemap-dependent features if there is no diffusemap
			if (!(features & Features.DiffuseMap)) {
				features &= ~Features.DiffuseAlphaIsTransparency;
				features &= ~Features.DiffuseAlphaIsOpacity;
			}

			// if (features != prePrune) {
			// 	console.info(`Filtered ${prePrune} to ${features}`);
			// }
			return features;
		}


		private updatePrimGroups(modelIx: number) {
			const mesh = this.meshMgr_.forEntity(this.entityBase_[modelIx]);
			if (! mesh) {
				return;
			}
			const groups = this.meshMgr_.primitiveGroups(mesh);
			const materialsOffsetCount = container.copyIndexedVec2(this.materialOffsetCountBase_, modelIx);
			const materialsOffset = materialsOffsetCount[0];
			const materialCount = materialsOffsetCount[1];

			// -- check correctness of mesh against material list
			const maxLocalMatIndex = groups.reduce((cur, group) => Math.max(cur, group.materialIx), 0);
			assert(materialCount >= maxLocalMatIndex - 1, "not enough StdMaterialIndexes for this mesh");

			// -- pre-calc global material indexes and program features for each group
			let primGroupCount = this.primGroupData_.count;
			this.primGroupOffsetBase_[modelIx] = this.primGroupData_.count;

			// -- grow primitiveGroup metadata buffer if necessary
			if (this.primGroupData_.resize(primGroupCount + groups.length) == container.InvalidatePointers.Yes) {
				this.groupRebase();
			}

			// -- append metadata for each primGroup
			groups.forEach(group => {
				this.primGroupFeatureBase_[primGroupCount] = this.featuresForMeshAndMaterial(mesh, this.materials_[materialsOffset + group.materialIx]);
				this.primGroupMaterialBase_[primGroupCount] = this.materials_[materialsOffset + group.materialIx];
				primGroupCount += 1;
			});
		}


		create(entity: Entity, desc: StdModelDescriptor): StdModelInstance {
			if (this.instanceData_.extend() == container.InvalidatePointers.Yes) {
				this.rebase();
			}
			const ix = this.instanceData_.count;

			this.entityBase_[ix] = <number>entity;
			this.transformBase_[ix] = <number>this.transformMgr_.forEntity(entity);
			this.enabledBase_[ix] = +true;
			this.shadowFlagBase_[ix] = 0;

			// -- save material indexes
			container.setIndexedVec2(this.materialOffsetCountBase_, ix, [this.materials_.length, desc.materials.length]);
			for (const mat of desc.materials) {
				this.materials_.push(this.materialMgr_.create(mat));
			}

			this.updatePrimGroups(ix);

			return ix;
		}


		destroy(_inst: StdModelInstance) {
			// TBI
		}


		destroyRange(range: StdModelRange) {
			const iter = range.makeIterator();
			while (iter.next()) {
				this.destroy(iter.current);
			}
		}


		get count() {
			return this.instanceData_.count;
		}

		valid(inst: StdModelInstance) {
			return <number>inst <= this.count;
		}

		all(): StdModelRange {
			return new InstanceLinearRange<StdModelManager>(1, this.count);
		}


		entity(inst: StdModelInstance): Entity {
			return this.entityBase_[<number>inst];
		}

		transform(inst: StdModelInstance): TransformInstance {
			return this.transformBase_[<number>inst];
		}

		enabled(inst: StdModelInstance): boolean {
			return this.enabledBase_[<number>inst] != 0;
		}

		setEnabled(inst: StdModelInstance, newEnabled: boolean) {
			this.enabledBase_[<number>inst] = +newEnabled;
		}


		shadowCaster(): LightInstance {
			return this.shadowCastingLightIndex_;
		}

		setShadowCaster(inst: LightInstance) {
			this.shadowCastingLightIndex_ = inst;
		}


		disableRenderFeature(f: RenderFeature) {
			if (f == RenderFeature.NormalMaps) {
				this.stdPipeline_.disableFeatures(Features.NormalMap);
			}
		}


		enableRenderFeature(f: RenderFeature) {
			if (f == RenderFeature.NormalMaps) {
				this.stdPipeline_.enableFeatures(Features.NormalMap);
			}
		}


		private drawSingleForward(rp: render.RenderPass, proj: ProjectionSetup, shadow: ShadowView | null, fogSpec: asset.FogDescriptor | null, modelIx: number) {
			const gl = this.rc.gl;
			let drawCalls = 0;

			const mesh = this.meshMgr_.forEntity(this.entityBase_[modelIx]);
			if (! mesh) {
				// console.warn(`No mesh attached to entity of stdModel ${modelIx}`);
				return;
			}

			// -- calc transform matrices
			const modelMatrix = this.transformMgr_.worldMatrix(this.transformBase_[modelIx]);
			mat4.multiply(this.modelViewMatrix_, proj.viewMatrix, modelMatrix);
			mat4.multiply(this.modelViewProjectionMatrix_, proj.projectionMatrix, this.modelViewMatrix_);

			// -- draw all groups
			const meshPrimitiveGroups = this.meshMgr_.primitiveGroups(mesh);
			const primGroupBase = this.primGroupOffsetBase_[modelIx];
			const primGroupCount = meshPrimitiveGroups.length;

			for (let pgIx = 0; pgIx < primGroupCount; ++pgIx) {
				const primGroup = meshPrimitiveGroups[pgIx];
				const matInst: StdMaterialInstance = this.primGroupMaterialBase_[primGroupBase + pgIx];
				const materialData = this.materialMgr_.getData(matInst);

				// -- features are a combo of Material features and optional shadow
				let features: Features = this.primGroupFeatureBase_[primGroupBase + pgIx];
				if (shadow) {
					features |= Features.ShadowMap;
				}

				if (fogSpec) {
					features |= Features.Fog;
				}

				const pipeline = this.stdPipeline_.pipelineForFeatures(features);

				// FIXME: what a pile of #$!@#
				if ((features & (Features.Translucency | Features.DiffuseAlphaIsOpacity)) === Features.Translucency) {
					pipeline.blendConstantAlpha = materialData.colourData[3];
				}

				rp.setPipeline(pipeline);
				rp.setMesh(mesh);

				// -- set transform and normal uniforms
				const program = <StdGLProgram>(pipeline.program);

				// model, mvp and normal matrices are always present
				gl.uniformMatrix4fv(program.modelMatrixUniform, false, <Float32Array>modelMatrix);
				gl.uniformMatrix4fv(program.mvpMatrixUniform, false, this.modelViewProjectionMatrix_);
				mat3.normalFromMat4(this.normalMatrix_, this.modelViewMatrix_);
				gl.uniformMatrix3fv(program.normalMatrixUniform, false, this.normalMatrix_);

				if (program.mvMatrixUniform) {
					gl.uniformMatrix4fv(program.mvMatrixUniform, false, this.modelViewMatrix_);
				}

				// -- set material uniforms
				gl.uniform4fv(program.mainColourUniform, materialData.colourData);
				if (features & Features.Specular) {
					gl.uniform4fv(program.specularUniform, materialData.specularData);
				}
				if (features & Features.Emissive) {
					gl.uniform4fv(program.emissiveDataUniform, materialData.emissiveData);
				}
				if (features & (Features.DiffuseMap | Features.NormalMap | Features.SpecularMap)) {
					gl.uniform4fv(program.texScaleOffsetUniform, materialData.texScaleOffsetData);
				}

				// these textures are assumed to exist if their feature flag is set
				// TODO: check every time?
				if (features & Features.DiffuseMap) {
					rp.setTexture(materialData.diffuseMap!, TextureBindPoint.Colour);
				}
				if (features & Features.SpecularMap) {
					rp.setTexture(materialData.specularMap!, TextureBindPoint.Specular);
				}
				if (features & Features.NormalMap) {
					rp.setTexture(materialData.normalMap!, TextureBindPoint.Normal);
				}
				if (features & Features.Skinned) {
					rp.setTexture(this.skeletonMgr_.jointDataTexture, TextureBindPoint.JointData);
				}

				// -- light data
				rp.setTexture(this.lightMgr_.lutTexture, TextureBindPoint.LightLUT);
				gl.uniform2fv(program.lightLUTParamUniform!, this.lightMgr_.lutParam);

				// -- fog data (TODO: directly using descriptor)
				if (fogSpec) {
					gl.uniform4fv(program.fogColourUniform!, new Float32Array([fogSpec.colour[0], fogSpec.colour[1], fogSpec.colour[2], 0]));
					gl.uniform4fv(program.fogParamsUniform!, new Float32Array([fogSpec.offset, fogSpec.depth, fogSpec.density, 0]));
				}

				// -- shadow map and metadata
				if (shadow) {
					gl.uniform1i(program.shadowCastingLightIndexUniform, this.shadowCastingLightIndex_ as number);

					rp.setTexture(shadow.filteredTexture || shadow.shadowFBO.colourAttachmentTexture(0)!, TextureBindPoint.Shadow);

					// mat4.multiply(this.lightViewProjectionMatrix_, shadow.lightProjection.projectionMatrix, shadow.lightProjection.viewMatrix);
					// const lightBiasMat = mat4.multiply([], mat4.fromTranslation([], [.5, .5, .5]), mat4.fromScaling([], [.5, .5, .5]));
					// mat4.multiply(this.lightViewProjectionMatrix_, lightBiasMat, this.lightViewProjectionMatrix_);

					gl.uniformMatrix4fv(program.lightViewMatrixUniform!, false, shadow.lightProjection.viewMatrix as Float32Array);
					gl.uniformMatrix4fv(program.lightProjMatrixUniform!, false, shadow.lightProjection.projectionMatrix as Float32Array);
				}

				// -- draw
				const indexElementType = this.meshMgr_.indexBufferElementType(mesh);
				if (indexElementType !== meshdata.IndexElementType.None) {
					rp.drawIndexedPrimitives(primGroup.type, indexElementType, primGroup.fromElement, primGroup.elementCount);
				}
				else {
					rp.drawPrimitives(primGroup.type, primGroup.fromElement, primGroup.elementCount);
				}

				drawCalls += 1;
			}

			return drawCalls;
		}


		private drawSingleShadow(rp: render.RenderPass, proj: ProjectionSetup, shadowPipeline: render.Pipeline, modelIx: number) {
			const gl = this.rc.gl;
			const program = shadowPipeline.program as ShadowProgram;
			const mesh = this.meshMgr_.forEntity(this.entityBase_[modelIx]);
			rp.setMesh(mesh);

			// -- calc MVP and set
			const modelMatrix = this.transformMgr_.worldMatrix(this.transformBase_[modelIx]);
			mat4.multiply(this.modelViewMatrix_, proj.viewMatrix, modelMatrix);
			mat4.multiply(this.modelViewProjectionMatrix_, proj.projectionMatrix, proj.viewMatrix);

			gl.uniformMatrix4fv(program.modelMatrixUniform, false, modelMatrix);
			gl.uniformMatrix4fv(program.lightViewMatrixUniform, false, proj.viewMatrix as Float32Array);
			gl.uniformMatrix4fv(program.lightViewProjectionMatrixUniform, false, this.modelViewProjectionMatrix_);

			// -- draw full mesh
			const uniformPrimType = this.meshMgr_.uniformPrimitiveType(mesh);
			if (uniformPrimType !== meshdata.PrimitiveType.None) {
				const totalElementCount = this.meshMgr_.totalElementCount(mesh);
				const indexElementType = this.meshMgr_.indexBufferElementType(mesh);
				if (indexElementType !== meshdata.IndexElementType.None) {
					rp.drawIndexedPrimitives(uniformPrimType, indexElementType, 0, totalElementCount);
				}
				else {
					rp.drawPrimitives(uniformPrimType, 0, totalElementCount);
				}
			}

			// -- drawcall count, always 1
			return 1;
		}


		private splitModelRange(range: StdModelRange, triggerFeature: Features, cullDisabled = false) {
			const withFeature = new InstanceSet<StdModelManager>();
			const withoutFeature = new InstanceSet<StdModelManager>();

			const iter = range.makeIterator();
			while (iter.next()) {
				const modelIx = <number>iter.current;
				const enabled = this.enabledBase_[modelIx];
				if (! enabled && cullDisabled) {
					continue;
				}

				const primGroupBase = this.primGroupOffsetBase_[modelIx];
				const firstPGFeatures: Features = this.primGroupFeatureBase_[primGroupBase];

				if ((firstPGFeatures & triggerFeature) == triggerFeature) {
					withFeature.add(iter.current);
				}
				else {
					withoutFeature.add(iter.current);
				}
			}

			return {
				with: withFeature,
				without: withoutFeature
			};
		}


		splitModelRangeByTranslucency(range: StdModelRange) {
			const split = this.splitModelRange(range, Features.Translucency, true);
			return {
				opaque: split.without,
				translucent: split.with
			};
		}


		draw(range: StdModelRange, rp: render.RenderPass, proj: ProjectionSetup, shadow: ShadowView | null, fogSpec: asset.FogDescriptor | null, mode: RenderMode) {
			let drawCalls = 0;

			if (mode == RenderMode.Forward) {
				const iter = range.makeIterator();
				while (iter.next()) {
					if (this.enabledBase_[<number>iter.current]) {
						drawCalls += this.drawSingleForward(rp, proj, shadow, fogSpec, <number>iter.current);
					}
				}
			}
			else if (mode == RenderMode.Shadow) {
				const shadowPipeline = this.stdPipeline_.shadowPipeline();
				rp.setPipeline(shadowPipeline);

				const iter = range.makeIterator();
				while (iter.next()) {
					if (this.enabledBase_[<number>iter.current]) {
						drawCalls += this.drawSingleShadow(rp, proj, shadowPipeline, <number>iter.current);
					}
				}
			}

			return drawCalls;
		}
	}

} // ns sd.world