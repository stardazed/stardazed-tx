/*
container/multi-array-buffer - dynamically sized struct of arrays
Part of Stardazed
(c) 2015-Present by Arthur Langereis - @zenmumbler
https://github.com/stardazed/stardazed
*/

import { clearArrayBuffer, roundUpPowerOf2 } from "stardazed/core";
import * as struct from "./structured-array";

export const enum InvalidatePointers {
	No,
	Yes
}

export class MultiArrayBuffer<UD = unknown> {
	/** @internal */
	private readonly backing_: struct.StructuredArray<UD>;
	/** @internal */
	private count_ = 0;

	/**
	 * @expects isPositiveNonZeroInteger(initialCapacity)
	 * @expects fields.length > 0
	 */
	constructor(initialCapacity: number, fields: struct.Field<UD>[], alignmentFn: struct.AlignmentFn = struct.packFields) {
		const layout = alignmentFn(fields);
		this.backing_ = struct.createStructuredArray(layout, struct.Topology.StructOfArrays, initialCapacity, struct.StorageAlignment.ItemMultipleOf32);
	}

	get fieldCount() { return this.backing_.layout.posFields.length; }

	/**
	 * @expects index >= 0 && index < this.fieldCount
	 */
	field(index: number) {
		return this.backing_.layout.posFields[index];
	}

	get capacity() { return this.backing_.storage.capacity; }
	get count() { return this.count_; }

	/**
	 * @expects itemCount > 0
	 * @internal
	 */
	private fieldArrayView(f: struct.PositionedField<UD>, buffer: ArrayBufferLike, itemCount: number) {
		const byteOffset = f.byteOffset * itemCount;
		return new (f.type.arrayType)(buffer, byteOffset, itemCount * f.count);
	}

	/**
	 * @expects newCapacity > 0
	 */
	reserve(newCapacity: number): InvalidatePointers {
		const oldCapacity = this.backing_.storage.capacity;
		struct.resizeStructuredArray(this.backing_, newCapacity);

		const invalidation = oldCapacity === this.capacity ? InvalidatePointers.No : InvalidatePointers.Yes;
		return invalidation;
	}

	clear() {
		this.count_ = 0;
		clearArrayBuffer(this.backing_.storage.data.buffer);
	}

	/**
	 * @expects isPositiveNonZeroInteger(newCount)
	 */
	resize(newCount: number): InvalidatePointers {
		let invalidation = InvalidatePointers.No;

		if (newCount > this.capacity) {
			// automatically expand up to next highest power of 2 size
			// FIXME: why is this again?
			invalidation = this.reserve(roundUpPowerOf2(newCount));
		}
		else if (newCount < this.count_) {
			// Reducing the count will clear the now freed up elements so that when
			// a new allocation is made the element data is guaranteed to be zeroed.
			const elementsToClear = this.count_ - newCount;

			for (const field of this.backing_.layout.posFields) {
				const array = this.fieldArrayView(field, this.backing_.storage.data.buffer, this.count_);
				const zeroes = new (field.type.arrayType)(elementsToClear * field.count);
				array.set(zeroes, newCount * field.count);
			}
		}

		this.count_ = newCount;
		return invalidation;
	}

	extend(): InvalidatePointers {
		let invalidation = InvalidatePointers.No;

		if (this.count_ === this.capacity) {
			invalidation = this.reserve(Math.ceil(this.capacity * 1.5));
		}

		++this.count_;
		return invalidation;
	}

	/**
	 * @expects index >= 0 && index < this.fields_.length
	 */
	indexedFieldView(index: number) {
		return this.fieldArrayView(this.backing_.layout.posFields[index], this.backing_.storage.data.buffer, this.capacity);
	}
}