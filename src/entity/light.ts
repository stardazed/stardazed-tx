// entity/light - Light component
// Part of Stardazed
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed

namespace sd.entity {

	export const enum LightType {
		None,
		Directional,
		Point,
		Spot
	}

	// export const enum ShadowType {
	// 	None,
	// 	Hard,
	// 	Soft
	// }

	// export const enum ShadowQuality {
	// 	Auto
	// }

	export interface Light {
		type: LightType;

		colour: Float3;
		intensity: number;

		range?: number;  // m   (point/spot only)
		cutoff?: number; // rad (spot only)

		// shadowType?: ShadowType;
		// shadowQuality?: ShadowQuality;
		// shadowStrength?: number;  // 0..1
		// shadowBias?: number;      // 0.001..0.1
	}

	// ----

	export type LightInstance = Instance<LightComponent>;
	export type LightRange = InstanceRange<LightComponent>;
	export type LightSet = InstanceSet<LightComponent>;
	export type LightIterator = InstanceIterator<LightComponent>;
	export type LightArrayView = InstanceArrayView<LightComponent>;

	// export interface ShadowView {
	// 	light: LightInstance;
	// 	lightProjection: math.ProjectionSetup;
	// 	shadowFBO: render.FrameBuffer;
	// 	filteredTexture?: render.Texture;
	// }


	// This setup allows for a viewport > 5K (5120x2880)
	// a global list of up to 32768 active lights and
	// an average of ~300 active lights per tile at 1920x1080
	// I will add smaller LUT texture options later (320x256, 160x128)
	const LUT_WIDTH = 640;
	const LUT_LIGHTDATA_ROWS = 256;
	const LUT_INDEXLIST_ROWS = 240;
	const LUT_GRID_ROWS = 16;
	const LUT_HEIGHT = LUT_LIGHTDATA_ROWS + LUT_INDEXLIST_ROWS + LUT_GRID_ROWS; // 512

	const TILE_DIMENSION = 32;
	const MAX_LIGHTS = ((LUT_WIDTH * LUT_LIGHTDATA_ROWS) / 5) | 0;

	interface LightGridSpan {
		lightIndex: number;
		fromCol: number;
		toCol: number;
	}


	export class LightComponent implements Component<LightComponent> {
		private instanceData_: container.FixedMultiArray;
		private entityBase_: EntityArrayView;
		private transformBase_: TransformArrayView;
		private enabledBase_: Uint8Array;
		// private shadowTypeBase_: ConstEnumArrayView<ShadowType>;
		// private shadowQualityBase_: ConstEnumArrayView<ShadowQuality>;

		private lightData_: container.FixedMultiArray;
		private globalLightData_: Float32Array;
		private tileLightIndexes_: Float32Array;
		private lightGrid_: Float32Array;
		private lutTexture_: render.Texture;
		private lutTilesWide_ = 0;
		private lutTilesHigh_ = 0;
		private lutParam_ = new Float32Array(2);
		private count_: number;

		private gridRowSpans_: LightGridSpan[][];

		private nullVec3_ = new Float32Array(3); // used to convert directions to rotations

		// private shadowFBO_: render.FrameBuffer | null = null;


		constructor(private transformMgr_: TransformComponent, resources: render.RenderResourceCommandBuffer) {
			this.count_ = 0;

			// instance info
			const instFields: container.MABField[] = [
				{ type: SInt32, count: 1 }, // entity
				{ type: SInt32, count: 1 }, // transformInstance
				{ type: UInt8,  count: 1 }, // enabled
				{ type: SInt32, count: 1 }, // shadowType
				{ type: SInt32, count: 1 }, // shadowQuality
			];
			this.instanceData_ = new container.FixedMultiArray(MAX_LIGHTS, instFields);
			this.entityBase_ = this.instanceData_.indexedFieldView(0);
			this.transformBase_ = this.instanceData_.indexedFieldView(1);
			this.enabledBase_ = this.instanceData_.indexedFieldView(2);
			// this.shadowTypeBase_ = this.instanceData_.indexedFieldView(3);
			// this.shadowQualityBase_ = this.instanceData_.indexedFieldView(4);

			// grid creation
			this.gridRowSpans_ = [];

			// light data texture
			const lutFields: container.MABField[] = [
				{ type: Float, count: 4 * LUT_LIGHTDATA_ROWS }, //
				{ type: Float, count: 4 * LUT_INDEXLIST_ROWS },
				{ type: Float, count: 4 * LUT_GRID_ROWS },
			];
			this.lightData_ = new container.FixedMultiArray(LUT_WIDTH, lutFields);
			this.globalLightData_ = this.lightData_.indexedFieldView(0);
			this.tileLightIndexes_ = this.lightData_.indexedFieldView(1);
			this.lightGrid_ = this.lightData_.indexedFieldView(2);

			this.lutTexture_ = render.makeTex2DFloatLUT(new Float32Array(this.lightData_.data), LUT_WIDTH, LUT_HEIGHT);
			resources.alloc(this.lutTexture_);

			vec3.set(this.nullVec3_, 1, 0, 0);
		}


		create(entity: Entity, desc: Light): LightInstance {
			// do we have any room left?
			assert(this.count_ < MAX_LIGHTS, "light storage exhausted");
			this.count_ += 1;
			const instance = this.count_;

			// validate parameters
			assert(desc.type !== LightType.None);

			// linking
			this.entityBase_[instance] = entity;
			this.transformBase_[instance] = this.transformMgr_.forEntity(entity);

			// all lights start out enabled
			this.enabledBase_[instance] = 1;

			// non-shader shadow data (all optional)
			// this.shadowTypeBase_[instance] = desc.shadowType || ShadowType.None;
			// this.shadowQualityBase_[instance] = desc.shadowQuality || ShadowQuality.Auto;

			// write global light data
			const gldV4Index = instance * 5;

			// pixel0: colour[3], type
			container.setIndexedVec4(this.globalLightData_, gldV4Index + 0, [desc.colour[0], desc.colour[1], desc.colour[2], desc.type]);
			// pixel1: position_cam[3], intensity
			container.setIndexedVec4(this.globalLightData_, gldV4Index + 1, [0, 0, 0, Math.max(0, desc.intensity)]);
			// pixel2: position_world[3], range
			container.setIndexedVec4(this.globalLightData_, gldV4Index + 2, [0, 0, 0, desc.range || 0]);
			// pixel3: direction[3], cutoff
			container.setIndexedVec4(this.globalLightData_, gldV4Index + 3, [0, 0, 0, Math.cos(desc.cutoff || 0)]);
			// pixel4: shadowStrength, shadowBias, 0, 0
			// container.setIndexedVec4(this.globalLightData_, gldV4Index + 4, [desc.shadowStrength || 1.0, desc.shadowBias || 0.002, 0, 0]);

			return instance;
		}

		destroy(_inst: LightInstance) {
			// TBI
		}

		destroyRange(range: LightRange) {
			const iter = range.makeIterator();
			while (iter.next()) {
				this.destroy(iter.current);
			}
		}


		get count() { return this.count_; }

		valid(inst: LightInstance) {
			return (inst as number) > 0 && (inst as number) <= this.count_;
		}

		all(): LightRange {
			return new InstanceLinearRange<LightComponent>(1, this.count);
		}

		// [AL] temporary
		allEnabled(): LightRange {
			const on: LightInstance[] = [];
			const all = this.all().makeIterator();
			while (all.next()) {
				const l = all.current;
				if (this.enabledBase_[l as number]) {
					on.push(all.current);
				}
			}
			return new InstanceArrayRange(on);
		}


		// -- light data calc

		private projectPointLight(outBounds: math.Rect, center: Float3, range: number, projectionViewportMatrix: Float4x4) {
			// if the camera is inside the range of the point light, just apply it to the full screen
			if (vec3.length(center) <= range * 1.3) { // apply some fudge factors because I'm tired
				outBounds.left = 0;
				outBounds.top = 5000;
				outBounds.right = 5000;
				outBounds.bottom = 0;
				return;
			}

			const cx = center[0];
			const cy = center[1];
			const cz = center[2];

			const vertices: number[][] = [
				[cx - range, cy - range, cz - range, 1.0],
				[cx - range, cy - range, cz + range, 1.0],
				[cx - range, cy + range, cz - range, 1.0],
				[cx - range, cy + range, cz + range, 1.0],
				[cx + range, cy - range, cz - range, 1.0],
				[cx + range, cy - range, cz + range, 1.0],
				[cx + range, cy + range, cz - range, 1.0],
				[cx + range, cy + range, cz + range, 1.0]
			];

			const min = [ 100000,  100000];
			const max = [-100000, -100000];
			const sp = [0, 0, 0, 0];

			for (let vix = 0; vix < 8; ++vix) {
				if (vertices[vix][2] <= 0.2) { // apply some fudge factors because I'm tired
					vec4.transformMat4(sp, vertices[vix], projectionViewportMatrix);
					vec4.scale(sp, sp, 1.0 / sp[3]);
					vec2.min(min, min, sp);
					vec2.max(max, max, sp);
				}
			}

			outBounds.left = min[0];
			outBounds.top = max[1];
			outBounds.right = max[0];
			outBounds.bottom = min[1];
		}


		private updateLightGrid(range: LightRange, projection: math.ProjectionSetup, viewport: render.Viewport) {
			const vpHeight = this.lutParam_[1];
			const tilesWide = this.lutTilesWide_;
			const tilesHigh = this.lutTilesHigh_;

			// reset grid row light index table
			for (let row = 0; row < tilesHigh; ++row) {
				this.gridRowSpans_[row] = [];
			}

			// indexes of non-measured lights
			const fullscreenLights: number[] = [];

			// matrix setup for ssb calculation
			const ssb: math.Rect = { left: 0, top: 0, right: 0, bottom: 0 };
			const viewportMatrix = math.viewportMatrix(viewport.originX, viewport.originY, viewport.width, viewport.height, viewport.nearZ, viewport.farZ);
			const VPP = mat4.multiply([], viewportMatrix, projection.projectionMatrix);

			// calculate light SSBs and fill the grid row table with rect references
			const iter = range.makeIterator();
			while (iter.next()) {
				const lix = iter.current as number;
				const lightType = this.type(lix);

				if (lightType === LightType.Point) {
					// calculate screen space bounds based on a simple point and radius cube
					const lcpos = this.positionCameraSpace(lix);
					const radius = this.range(lix);
					// the resulting rect has the bottom-left as origin (bottom < top)
					this.projectPointLight(ssb, lcpos, radius, VPP);

					// create a span for this rect in the rows it occupies
					const rowTop = Math.floor((vpHeight - ssb.top) / TILE_DIMENSION);
					const rowBottom = Math.floor((vpHeight - ssb.bottom) / TILE_DIMENSION);
					const colLeft = Math.floor(ssb.left / TILE_DIMENSION);
					const colRight = Math.floor(ssb.right / TILE_DIMENSION);

					if (rowTop < tilesHigh && rowBottom >= 0 && colLeft < tilesWide && colRight > 0) {
						const rowFrom = math.clamp(rowTop, 0, tilesHigh - 1);
						const rowTo = math.clamp(rowBottom, 0, tilesHigh - 1);
						const colFrom = math.clamp(colLeft, 0, tilesWide - 1);
						const colTo = math.clamp(colRight, 0, tilesWide - 1);
						for (let row = rowFrom; row <= rowTo; ++row) {
							this.gridRowSpans_[row].push({ lightIndex: lix, fromCol: colFrom, toCol: colTo });
						}
					}
				}
				else {
					// for non-point lights just indicate that they occupy the entire screen
					fullscreenLights.push(lix);
				}
			}

			// finally, populate the light grid and index tables
			let cellLightIndexOffset = 0;
			let nextLightIndexOffset = 0;
			let cellGridOffset = 0;

			for (let row = 0; row < tilesHigh; ++row) {
				const spans = this.gridRowSpans_[row];

				// add full screen and and light spans to the grid
				for (let col = 0; col < tilesWide; ++col) {
					for (const fsLight of fullscreenLights) {
						this.tileLightIndexes_[nextLightIndexOffset] = fsLight;
						nextLightIndexOffset += 1;
					}
					for (const span of spans) {
						if (span.fromCol <= col && span.toCol >= col) {
							this.tileLightIndexes_[nextLightIndexOffset] = span.lightIndex;
							nextLightIndexOffset += 1;
						}
					}

					// update grid pixel for this cell with x = offset, y = size, z = 0, w = 0
					this.lightGrid_[cellGridOffset] = cellLightIndexOffset;
					this.lightGrid_[cellGridOffset + 1] = nextLightIndexOffset - cellLightIndexOffset;
					cellGridOffset += 2;

					cellLightIndexOffset = nextLightIndexOffset;
				}
			}

			return {
				indexPixelsUsed: Math.ceil(nextLightIndexOffset / 4),
				gridRowsUsed: Math.ceil((tilesWide * tilesHigh) / 2 / LUT_WIDTH)
			};
		}


		prepareLightsForRender(range: LightRange, proj: math.ProjectionSetup, targetDim: image.PixelDimensions, viewport: render.Viewport) {
			// update lut dimensions
			this.lutTilesWide_ = Math.ceil(targetDim.width / TILE_DIMENSION);
			this.lutTilesHigh_ = Math.ceil(targetDim.height / TILE_DIMENSION);
			this.lutParam_[0] = this.lutTilesWide_;
			this.lutParam_[1] = targetDim.height;

			const viewNormalMatrix = mat3.normalFromMat4([], proj.viewMatrix);

			// calculate world and camera space vectors of each light
			let highestLightIndex = 0;
			const iter = range.makeIterator();

			while (iter.next()) {
				const lix = iter.current as number;
				if (lix > highestLightIndex) {
					highestLightIndex = lix;
				}

				const type = this.type(lix);
				const transform = this.transformBase_[lix];

				if (type !== LightType.Directional) {
					const lightPos_world = this.transformMgr_.worldPosition(transform); // tslint:disable-line:variable-name
					const lightPos_cam = vec3.transformMat4([], lightPos_world, proj.viewMatrix); // tslint:disable-line:variable-name

					const posCamOffset = (lix * 20) + 4;
					this.globalLightData_[posCamOffset] = lightPos_cam[0];
					this.globalLightData_[posCamOffset + 1] = lightPos_cam[1];
					this.globalLightData_[posCamOffset + 2] = lightPos_cam[2];

					const posWorldOffset = (lix * 20) + 8;
					this.globalLightData_[posWorldOffset] = lightPos_world[0];
					this.globalLightData_[posWorldOffset + 1] = lightPos_world[1];
					this.globalLightData_[posWorldOffset + 2] = lightPos_world[2];
				}
				if (type !== LightType.Point) {
					const rotMat = mat3.normalFromMat4([], this.transformMgr_.worldMatrix(transform));
					const lightDir_world = vec3.transformMat3([], this.nullVec3_, rotMat); // tslint:disable-line:variable-name
					const lightDir_cam = vec3.transformMat3([], lightDir_world, viewNormalMatrix); // tslint:disable-line:variable-name

					const dirOffset = (lix * 20) + 12;
					this.globalLightData_[dirOffset] = lightDir_cam[0];
					this.globalLightData_[dirOffset + 1] = lightDir_cam[1];
					this.globalLightData_[dirOffset + 2] = lightDir_cam[2];
				}
			}

			// recalculate grid
			const { indexPixelsUsed, gridRowsUsed } = this.updateLightGrid(range, proj, viewport);

			// update texture data
			const gllRowsUsed = Math.ceil(highestLightIndex / LUT_WIDTH);
			const indexRowsUsed = Math.ceil(indexPixelsUsed / LUT_WIDTH);

			// resource updates
			const cmd = new render.RenderCommandBuffer();
			// TODO: should use slice to only pass subarray of data actually being sent?
			cmd.textureWrite(this.lutTexture_, 0, image.makePixelCoordinate(0, 0), image.makePixelDimensions(LUT_WIDTH, gllRowsUsed), this.globalLightData_);
			cmd.textureWrite(this.lutTexture_, 0, image.makePixelCoordinate(0, LUT_LIGHTDATA_ROWS), image.makePixelDimensions(LUT_WIDTH, indexRowsUsed), this.tileLightIndexes_);
			cmd.textureWrite(this.lutTexture_, 0, image.makePixelCoordinate(0, LUT_LIGHTDATA_ROWS + LUT_INDEXLIST_ROWS), image.makePixelDimensions(LUT_WIDTH, gridRowsUsed), this.lightGrid_);
			return cmd;
		}


		get lutTexture() {
			return this.lutTexture_;
		}

		get lutParam() {
			// gridWidth, vpHeight
			return this.lutParam_;
		}


		// -- linked objects

		entity(inst: LightInstance): Entity {
			return this.entityBase_[inst as number];
		}

		transform(inst: LightInstance): TransformInstance {
			return this.transformBase_[inst as number];
		}


		// -- enabledness

		enabled(inst: LightInstance): boolean {
			return this.enabledBase_[inst as number] === 1;
		}

		setEnabled(inst: LightInstance, newEnabled: boolean) {
			const newVal = +newEnabled;
			if (this.enabledBase_[inst as number] !== newVal) {
				this.enabledBase_[inst as number] = newVal;
			}
		}


		// -- indirect properties (in Transform)

		localPosition(inst: LightInstance): number[] {
			return this.transformMgr_.localPosition(this.transformBase_[inst as number]);
		}

		setLocalPosition(inst: LightInstance, newPosition: Float3) {
			this.transformMgr_.setPosition(this.transformBase_[inst as number], newPosition);
		}

		worldPosition(inst: LightInstance): number[] {
			return this.transformMgr_.worldPosition(this.transformBase_[inst as number]);
		}


		direction(inst: LightInstance) {
			const rotMat = mat3.normalFromMat4([], this.transformMgr_.worldMatrix(this.transformBase_[inst as number]));
			return vec3.normalize([], vec3.transformMat3([], this.nullVec3_, rotMat));
		}

		setDirection(inst: LightInstance, newDirection: Float3) {
			const normalizedDir = vec3.normalize([], newDirection);
			this.transformMgr_.setRotation(this.transformBase_[inst as number], quat.rotationTo([], this.nullVec3_, normalizedDir));
		}


		// -- derived properties

		positionCameraSpace(inst: LightInstance) {
			const posCamOffset = ((inst as number) * 20) + 4;
			return this.globalLightData_.slice(posCamOffset, posCamOffset + 3);
		}

		// projectionSetupForLight(inst: LightInstance, viewportWidth: number, viewportHeight: number, nearZ: number): math.ProjectionSetup | null {
		// 	const transform = this.transformBase_[<number>inst];
		// 	const worldPos = this.transformMgr_.worldPosition(transform);
		// 	const worldDirection = this.direction(inst);
		// 	const worldTarget = vec3.add([], worldPos, worldDirection);

		// 	let viewMatrix: Float4x4;
		// 	let projectionMatrix: Float4x4;

		// 	const type = this.type(inst);
		// 	if (type == LightType.Spot) {
		// 		const farZ = this.range(inst);
		// 		const fov = this.cutoff(inst) * 2; // cutoff is half-angle
		// 		viewMatrix = mat4.lookAt(new Float32Array(16), worldPos, worldTarget, [0, 1, 0]); // FIXME: this can likely be done cheaper
		// 		projectionMatrix = mat4.perspective(new Float32Array(16), fov, viewportWidth / viewportHeight, nearZ, farZ);
		// 		// TODO: cache this matrix?
		// 	}
		// 	else if (type == LightType.Directional) {
		// 		viewMatrix = mat4.lookAt(new Float32Array(16), [0, 0, 0], worldDirection, [0, 1, 0]); // FIXME: this can likely be done cheaper
		// 		projectionMatrix = mat4.ortho(new Float32Array(16), -40, 40, -40, 40, -40, 40);
		// 	}
		// 	else {
		// 		return null;
		// 	}

		// 	return {
		// 		projectionMatrix: projectionMatrix,
		// 		viewMatrix: viewMatrix
		// 	};
		// }


		// private shadowFrameBufferOfQuality(rc: render.RenderDevice, _quality: ShadowQuality) {
		// 	// TODO: each shadow quality level of shadows will have a dedicated, reusable FBO
		// 	if (! this.shadowFBO_) {
		// 		this.shadowFBO_ = render.makeShadowMapFrameBuffer(rc, 1024);
		// 	}
		// 	return this.shadowFBO_;
		// }


		// shadowViewForLight(rc: render.RenderDevice, inst: LightInstance, nearZ: number): ShadowView | null {
		// 	const fbo = this.shadowFrameBufferOfQuality(rc, this.shadowQualityBase_[<number>inst]);
		// 	const projection = this.projectionSetupForLight(inst, fbo.width, fbo.height, nearZ);
		// 	return projection && {
		// 		light: inst,
		// 		lightProjection: projection,
		// 		shadowFBO: fbo
		// 	};
		// }


		// -- internal properties

		type(inst: LightInstance): LightType {
			const offset = ((inst as number) * 20) + 3;
			return this.globalLightData_[offset];
		}


		colour(inst: LightInstance): number[] {
			const v4Index = ((inst as number) * 5) + 0;
			return container.copyIndexedVec4(this.globalLightData_, v4Index).slice(0, 3);
		}

		setColour(inst: LightInstance, newColour: Float3) {
			const offset = (inst as number) * 20;
			this.globalLightData_[offset] = newColour[0];
			this.globalLightData_[offset + 1] = newColour[1];
			this.globalLightData_[offset + 2] = newColour[2];
		}


		intensity(inst: LightInstance) {
			const offset = ((inst as number) * 20) + 7;
			return this.globalLightData_[offset];
		}

		setIntensity(inst: LightInstance, newIntensity: number) {
			const offset = ((inst as number) * 20) + 7;
			this.globalLightData_[offset] = newIntensity;
		}


		range(inst: LightInstance) {
			const offset = ((inst as number) * 20) + 11;
			return this.globalLightData_[offset];
		}

		setRange(inst: LightInstance, newRange: number) {
			const offset = ((inst as number) * 20) + 11;
			this.globalLightData_[offset] = newRange;
		}


		// cutoff is stored as the cosine of the angle for quick usage in the shader
		cutoff(inst: LightInstance) {
			const offset = ((inst as number) * 20) + 15;
			return Math.acos(this.globalLightData_[offset]);
		}

		setCutoff(inst: LightInstance, newCutoff: number) {
			const offset = ((inst as number) * 20) + 15;
			this.globalLightData_[offset] = Math.cos(newCutoff);
		}


		// -- shadow data

		// shadowType(inst: LightInstance): ShadowType {
		// 	return this.shadowTypeBase_[<number>inst];
		// }

		// setShadowType(inst: LightInstance, newType: ShadowType) {
		// 	this.shadowTypeBase_[<number>inst] = newType;
		// }


		// shadowQuality(inst: LightInstance): ShadowQuality {
		// 	return this.shadowQualityBase_[<number>inst];
		// }

		// setShadowQuality(inst: LightInstance, newQuality: ShadowQuality) {
		// 	this.shadowQualityBase_[<number>inst] = newQuality;
		// }


		// shadowStrength(inst: LightInstance): number {
		// 	const offset = ((inst as number) * 20) + 16;
		// 	return this.globalLightData_[offset];
		// }

		// setShadowStrength(inst: LightInstance, newStrength: number) {
		// 	const offset = ((inst as number) * 20) + 16;
		// 	this.globalLightData_[offset] = newStrength;
		// }


		// shadowBias(inst: LightInstance): number {
		// 	const offset = ((inst as number) * 20) + 17;
		// 	return this.globalLightData_[offset];
		// }

		// setShadowBias(inst: LightInstance, newBias: number) {
		// 	const offset = ((inst as number) * 20) + 17;
		// 	this.globalLightData_[offset] = newBias;
		// }
	}

} // ns sd.world