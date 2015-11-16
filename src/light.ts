// light - Light component
// Part of Stardazed TX
// (c) 2015 by Arthur Langereis - @zenmumbler

namespace sd.world {

	export const enum LightType {
		None,
		Directional
	}


	export type LightInstance = Instance<LightManager>;

	export interface LightDescriptor {
		colour: ArrayOfNumber;
		ambientIntensity: number;
		diffuseIntensity: number;
	}


	export class LightManager {
		private instanceData_: container.MultiArrayBuffer;

		private typeBase_: TypedArray;
		private colourBase_: TypedArray;
		private parameterBase_: TypedArray;
		private transforms_: TransformInstance[];

		private tempVec4_ = new Float32Array(4);


		constructor(private transformMgr_: TransformManager) {
			const initialCapacity = 256;

			var fields: container.MABField[] = [
				{ type: UInt8, count: 1 },  // type
				{ type: Float, count: 4 },  // colour[3], 0
				{ type: Float, count: 4 },  // ambientIntensity, diffuseIntensity, 0, 0
			];

			this.instanceData_ = new container.MultiArrayBuffer(initialCapacity, fields);
			this.rebase();
		}


		private rebase() {
			this.typeBase_ = this.instanceData_.indexedFieldView(0);
			this.colourBase_ = this.instanceData_.indexedFieldView(1);
			this.parameterBase_ = this.instanceData_.indexedFieldView(2);
		}


		createDirectionalLight(entity: Entity, desc: LightDescriptor, orientation: ArrayOfNumber): LightInstance {
			if (this.instanceData_.extend() == container.InvalidatePointers.Yes) {
				this.rebase();
			}

			var instanceIx = this.instanceData_.count;

			vec4.set(this.tempVec4_, desc.colour[0], desc.colour[1], desc.colour[2], 0);
			math.vectorArrayItem(this.colourBase_, math.Vec4, instanceIx).set(this.tempVec4_);

			vec4.set(this.tempVec4_, desc.ambientIntensity, desc.diffuseIntensity, 0, 0);
			math.vectorArrayItem(this.parameterBase_, math.Vec4, instanceIx).set(this.tempVec4_);

			var transform = this.transformMgr_.forEntity(entity);
			this.transformMgr_.setRotation(transform, quat.rotationTo([], [1, 0, 0], orientation));
			this.transforms_[instanceIx] = transform;

			return instanceIx;
		}


		colour(inst: LightInstance) {
			return math.vectorArrayItem(this.colourBase_, math.Vec4, <number>inst).subarray(0, 3);
		}


		ambientIntensity(inst: LightInstance) {
			return math.vectorArrayItem(this.parameterBase_, math.Vec4, <number>inst)[0];
		}
	
		setAmbientIntensity(inst: LightInstance, newIntensity: number) {
			math.vectorArrayItem(this.parameterBase_, math.Vec4, <number>inst)[0] = newIntensity;
		}

		diffuseIntensity(inst: LightInstance) {
			return math.vectorArrayItem(this.parameterBase_, math.Vec4, <number>inst)[1];
		}

		setDiffuseIntensity(inst: LightInstance, newIntensity: number) {
			math.vectorArrayItem(this.parameterBase_, math.Vec4, <number>inst)[1] = newIntensity;
		}


		getData(inst: LightInstance) {
			return {
				type: this.typeBase_[<number>inst],
				colourData: math.vectorArrayItem(this.colourBase_, math.Vec4, <number>inst),
				parameterData: math.vectorArrayItem(this.parameterBase_, math.Vec4, <number>inst)
			};
		}
	}

} // ns sd.world