// util.ts - common helpers and types
// Part of Stardazed TX
// (c) 2015-2016 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed-tx

declare global {
	interface Console {
		// Safari-specific debugging extension
		takeHeapSnapshot(): void;
	}
}

export function assert(cond: any, msg?: string) {
	if (! cond) {
		console.error(msg || "assertion failed");
		throw new Error(msg || "assertion failed");
	}
}


// Shallow clone an object. Use only for simple struct types.
export function cloneStruct<T>(object: T): T {
	const copy: any = {};
	Object.getOwnPropertyNames(object).forEach(name => {
		copy[name] = (object as any)[name];
	});
	return copy as T;
}


// Deep clone an object. Use only for simple struct types.
export function cloneStructDeep<T>(object: T): T {
	const copy: any = {};
	Object.getOwnPropertyNames(object).forEach(name => {
		if (typeof (object as any)[name] === "object") {
			copy[name] = cloneStructDeep((object as any)[name]);
		}
		else {
			copy[name] = (object as any)[name];
		}
	});
	return copy as T;
}


// copy all values from source to dest
export function copyValues(dest: any, source: any) {
	Object.getOwnPropertyNames(source).forEach(name => {
		dest[name] = source[name];
	});
}