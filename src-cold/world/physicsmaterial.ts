// world/physicsmaterial - Physics Material asset
// Part of Stardazed TX
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed-tx

namespace sd.world {

	export type PhysicsMaterialRef = Instance<PhysicsMaterialManager>;
	export type PhysicsMaterialArrayView = InstanceArrayView<PhysicsMaterialManager>;


	export class PhysicsMaterialData {
		friction = 0;    // 0..1
		restitution = 0; // 0..1
	}


	export class PhysicsMaterialManager {
		private instanceData_: (PhysicsMaterialData | null)[] = [null];
		private freed_ = new Set<PhysicsMaterialRef>();

		create(desc: PhysicsMaterialData): PhysicsMaterialRef {
			let nextRef: PhysicsMaterialRef = 0;
			if (this.freed_.size > 0) {
				nextRef = this.freed_.values().next().value!;
				this.freed_.delete(nextRef);
			}
			else {
				nextRef = this.instanceData_.length;
			}

			this.instanceData_[<number>nextRef] = cloneStruct(desc);
			return nextRef;
		}


		destroy(ref: PhysicsMaterialRef) {
			if (! this.valid(ref)) {
				return;
			}

			const index = <number>ref;
			if (index == this.instanceData_.length - 1) {
				this.instanceData_.length = index;
			}
			else {
				this.instanceData_[index] = null;
				this.freed_.add(ref);
			}
		}


		get count() {
			return this.instanceData_.length - 1 - this.freed_.size;
		}


		valid(ref: PhysicsMaterialRef) {
			const index = <number>ref;
			return (index < this.instanceData_.length) && (this.instanceData_[index] != null);
		}


		item(ref: PhysicsMaterialRef): PhysicsMaterialData {
			assert(this.valid(ref));
			return this.instanceData_[<number>ref]!; // the above assert validates the index
		}
	}

} // ns sd.world