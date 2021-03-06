/*
container/struct-common - Shared types and methods for structured buffers
Part of Stardazed
(c) 2015-Present by @zenmumbler
https://github.com/stardazed/stardazed
*/

import { NumericTypeRef } from "stardazed/core";

export type StructField<C = unknown> = C & {
	/** Optional name for this field */
	name?: string;
	/** The numeric type of each element in this field */
	type: NumericTypeRef;
	/** The number of elements that make up a single value of this field */
	width: number;
};

export type PositionedStructField<C> = Readonly<StructField<C>> & {
	/** Aligned position of this field within a struct or buffer */
	byteOffset: number;
	/** Total number of bytes for all elements in this field or of all values in a buffer */
	byteLength: number;
};

export interface FieldView extends Iterable<TypedArray> {
	/** The width of each value covered by this view */
	readonly width: number;
	/** The number of values covered by this view */
	readonly length: number;
	/** The base of the values covered by this view */
	readonly base: TypedArray;
	/** The base index starting from the buffer's origin of this view */
	readonly baseIndex: number;

	/** Get the offset in elements from this.base of a single value */
	offsetOfItem(index: number): number;
	/** Get a mutable reference to a single value */
	refItem(index: number): TypedArray;
	/** Get a copy of a single value */
	copyItem(index: number): number[];
	/** Update the elements of a single value */
	setItem(index: number, value: NumArray): void;

	/** Copy the provided value into all or a range of values of this view */
	fill(value: NumArray, fromIndex?: number, toIndex?: number): void;

	/**
	 * Copy values from a source array into consecutive values
	 *
	 * @param source an array of numeric values
	 * @param valueCount the number of values to copy from source into attributes
	 * @param atOffset (optional) the first index to start writing values into attributes
	 */
	copyValuesFrom(source: NumArray, valueCount: number, atOffset?: number): void;

	/** Create a view on a sub-range of values of this view */
	subView(fromIndex: number, toIndex: number): FieldView;
}

export function createNameIndexMap(fields: StructField<unknown>[]) {
	const mapping: Record<string, number> = {};
	for (let ix = 0; ix < fields.length; ++ix) {
		const name = fields[ix].name;
		// skip empty or undefined string name indexes
		if (name) {
			mapping[name] = ix;
		}
	}
	return mapping;
}
