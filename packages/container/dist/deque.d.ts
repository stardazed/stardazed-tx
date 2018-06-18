/**
 * container/deque - generic double-ended queue container class
 * Part of Stardazed
 * (c) 2015-Present by Arthur Langereis - @zenmumbler
 * https://github.com/stardazed/stardazed
 */
export declare class Deque<T> {
    private blocks_;
    private headBlock_;
    private headIndex_;
    private tailBlock_;
    private tailIndex_;
    private count_;
    private blockCapacity;
    private newBlock;
    private readonly headBlock;
    private readonly tailBlock;
    constructor();
    append(t: T): void;
    prepend(t: T): void;
    popFront(): void;
    popBack(): void;
    clear(): void;
    readonly count: number;
    readonly empty: boolean;
    readonly front: T;
    readonly back: T;
}
