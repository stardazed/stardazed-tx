/*
container/numeric-deque - double-ended numeric chunked queue
Part of Stardazed
(c) 2015-Present by @zenmumbler
https://github.com/stardazed/stardazed
*/

/**
 * Numeric queue with array-like methods. Use for numeric queues that
 * will have numbers added to and removed from it on both ends. The queue
 * is chunked and limits (de)allocations by retaining 1 extra chunk on each
 * end. You can specify the capacity of each chunk based on expected
 * usage of the queue.
 *
 * If you only need a FIFO numeric queue then use {@link NumericQueue}
 */
export class NumericDeque {
	/** @internal */
	private readonly chunkCtor_: TypedArrayConstructor;
	/** @internal */
	private readonly chunkCapacity_: number;

	/** @internal */
	private chunks_: TypedArray[];
	/** @internal */
	private headChunkIndex_: number;
	/** @internal */
	private headIndex_: number;
	/** @internal */
	private tailChunkIndex_: number;
	/** @internal */
	private tailIndex_: number;
	/** @internal */
	private length_: number;

	/** @internal */
	private newChunk() {
		return new this.chunkCtor_(this.chunkCapacity_);
	}

	/** @internal */
	private get headChunk() { return this.chunks_[this.headChunkIndex_]; }
	/** @internal */
	private get tailChunk() { return this.chunks_[this.tailChunkIndex_]; }

	/**
	 * @expects isPositiveNonZeroInteger(chunkCapacity)
	 */
	constructor(chunkType: TypedArrayConstructor, chunkCapacity = 512) {
		this.chunkCtor_ = chunkType;
		this.chunkCapacity_ = chunkCapacity;

		this.chunks_ = [];
		this.chunks_.push(this.newChunk());

		this.headChunkIndex_ = this.tailChunkIndex_ = 0;
		this.headIndex_ = this.tailIndex_ = 0;
		this.length_ = 0;
	}

	push(n: number) {
		if (this.tailIndex_ === this.chunkCapacity_) {
			if (this.tailChunkIndex_ === this.chunks_.length - 1) {
				this.chunks_.push(this.newChunk());
			}

			this.tailChunkIndex_++;
			this.tailIndex_ = 0;
		}

		this.tailChunk[this.tailIndex_] = n;
		++this.tailIndex_;
		++this.length_;
	}

	unshift(n: number) {
		if (this.headIndex_ === 0) {
			if (this.headChunkIndex_ === 0) {
				this.chunks_.unshift(this.newChunk());
				++this.tailChunkIndex_;
			}
			else {
				--this.headChunkIndex_;
			}

			this.headIndex_ = this.chunkCapacity_;
		}

		--this.headIndex_;
		this.headChunk[this.headIndex_] = n;
		++this.length_;
	}

	/**
	 * @expects this.length > 0
	 */
	shift() {
		const value = this.headChunk[this.headIndex_];

		++this.headIndex_;

		if (this.headIndex_ === this.chunkCapacity_) {
			// Strategy: keep max. 1 block before head if it was previously created.
			// Once we get to 2 empty blocks before head, then remove the front block.

			if (this.headChunkIndex_ === 0) {
				++this.headChunkIndex_;
			}
			else if (this.headChunkIndex_ === 1) {
				this.chunks_.shift();
				this.tailChunkIndex_--;
			}

			this.headIndex_ = 0;
		}

		--this.length_;
		return value;
	}

	/**
	 * @expects this.length > 0
	 */
	pop() {
		if (this.tailIndex_ === 0) {
			// Strategy: keep max. 1 block after tail if it was previously created.
			// Once we get to 2 empty blocks after tail, then remove the back block.
			const lastBlockIndex = this.chunks_.length - 1;

			if (this.tailChunkIndex_ === lastBlockIndex - 1) {
				this.chunks_.pop();
			}

			--this.tailChunkIndex_;
			this.tailIndex_ = this.chunkCapacity_;
		}

		--this.tailIndex_;
		--this.length_;

		return this.tailChunk[this.tailIndex_];
	}

	clear() {
		this.chunks_ = [];

		this.headChunkIndex_ = this.tailChunkIndex_ = 0;
		this.headIndex_ = this.tailIndex_ = 0;
		this.length_ = 0;
	}

	get length() { return this.length_; }
	get empty() { return this.length_ === 0; }

	/**
	 * @expects this.length > 0
	 */
	get front() {
		return this.headChunk[this.headIndex_];
	}

	/**
	 * @expects this.length > 0
	 */
	get back() {
		return (this.tailIndex_ > 0) ? this.tailChunk[this.tailIndex_ - 1] : this.chunks_[this.tailChunkIndex_ - 1][this.chunkCapacity_ - 1];
	}
}
