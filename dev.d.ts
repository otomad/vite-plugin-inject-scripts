declare interface Array<T> {
	includes(searchElement: any, fromIndex?: number): searchElement is T;
}

declare interface ReadonlyArray<T> {
	includes(searchElement: any, fromIndex?: number): searchElement is T;
}
