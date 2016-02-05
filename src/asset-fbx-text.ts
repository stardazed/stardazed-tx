// asset-fbx-text.ts - FBX text file tokenizer and parser
// Part of Stardazed TX
// (c) 2016 by Arthur Langereis - @zenmumbler

namespace sd.asset.fbx {

	const enum TokenType {
		Invalid,
		EOF,

		Key,
		String,
		Number,
		ArrayCount,

		OpenBlock,
		CloseBlock,
		Comma
	}


	interface Token {
		type: TokenType;
		offset: number;
		val?: string | number;
	}


	class FBXTextTokenizer {
		private offset = -1;
		private length = 0;
		private lastChar = "";

		constructor(private source: string) {
			this.length = source.length;
		}

		private nextChar() {
			this.offset++;
			if (this.offset < this.length) {
				this.lastChar = this.source[this.offset];
			}
			else {
				this.lastChar = null;
			}

			return this.lastChar;
		}


		private skipWS() {
			var c: string;
			while (c = this.nextChar()) {
				if (c != ' ' && c != '\t' && c != '\r' && c != '\n')
					break;
			}
		}


		private skipToLineEnd() {
			var c: string;
			while (c = this.nextChar()) {
				if (c == '\r' || c == '\n')
					break;
			}
		}


		nextToken(): Token {
			this.skipWS();
			if (this.offset >= this.length) {
				this.offset = this.length;
				return {
					type: TokenType.EOF,
					offset: this.length
				};
			}

			var tokenStart = this.offset;
			var tokenEnd = 0;
			var c = this.lastChar;

			var invalid = (): Token => { return {
				type: TokenType.Invalid,
				offset: tokenStart,
				val: this.source.substring(tokenStart, tokenEnd + 1)
			}; };


			if (c == ';') {
				// single-line comment
				this.skipToLineEnd();
				return this.nextToken();
			}
			else if (c == '"') {
				// string literal, there are no escape sequences or other fanciness
				while (c = this.nextChar()) {
					if (c == '"' || c == '\r' || c == '\n')
						break;
				}
				tokenEnd = this.offset;

				if (c != '"') {
					return invalid();
				}
				else {
					return {
						type: TokenType.String,
						offset: tokenStart,
						val: this.source.substring(tokenStart + 1, tokenEnd)
					};
				}
			}
			else if (c == ',') {
				return {
					type: TokenType.Comma,
					offset: tokenStart
				};
			}
			else if (c == '{') {
				return {
					type: TokenType.OpenBlock,
					offset: tokenStart
				};
			}
			else if (c == '}') {
				return {
					type: TokenType.CloseBlock,
					offset: tokenStart
				};
			}
			else {
				// find end of token based on break-chars
				let firstChar = c;
				while (c = this.nextChar()) {
					if (c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == ',' || c == '{' || c == '}')
						break;
				}

				// rewind 1 pos to allow non-ws breaking chars to be separate tokens
				tokenEnd = this.offset;
				this.offset--;
				let token = this.source.substring(tokenStart, tokenEnd);

				if ((firstChar >= 'A' && firstChar <= 'Z') || (firstChar >= 'a' && firstChar <= 'z')) {
					// A non-quoted string starting with alphabetic character can only be a Label...
					// ...except for the "Shading" property which has an unquoted string (T or Y) as a value
					if (token == "T" || token == "Y") {
						return {
							type: TokenType.String,
							offset: tokenStart,
							val: token
						};
					}
					if (token.length < 2 || (token[token.length - 1] != ':')) {
						return invalid();
					}

					// TODO: verify that only correct chars are used in label [a-zA-Z0-9]
					return {
						type: TokenType.Key,
						offset: tokenStart,
						val: token.substr(0, token.length - 1)
					};
				}
				else if (firstChar == '*' || firstChar == '-' || (firstChar >= '0' && firstChar <= '9')) {
					// Numbers are either int32s, floats or the count of a following array.
					// Counts are indicated by having an * prefix.

					if (firstChar == '*') {
						if (token.length < 2) {
							return invalid();
						}
						else {
							let count = parseFloat(token.substr(1));
							if (isNaN(count) || count != (count | 0) || count < 1) {
								return invalid();
							}
							return {
								type: TokenType.ArrayCount,
								offset: tokenStart,
								val: count | 0
							};
						}
					}
					else {
						let number = parseFloat(token);
						if (isNaN(number)) {
							return invalid();
						}
						return {
							type: TokenType.Number,
							offset: tokenStart,
							val: number
						};
					}
				}
				else {
					return invalid();
				}
			}
		}
	}


	const enum Expect {
		Key				 = 0x0001,
		Value            = 0x0002,
		Comma            = 0x0004,
		Open             = 0x0008,
		Close            = 0x0010,
		ArrayCount       = 0x0020,

		ValueOrOpen      = Value | Open,
		CommaOrOpenOrKey = Key | Open | Comma
	}


	export class FBXTextParser {
		private tokenizer_: FBXTextTokenizer;

		private expect_ = Expect.Key;
		private expectNextKey_: string = null;

		private eof_ = false;
		private depth_ = 0;
		private inProp70Block_ = false;
		private skippingUntilDepth_ = 1000;

		private array_: TypedArray = null;
		private arrayLength_ = 0;
		private arrayIndex_ = 0;

		private values_: FBXValue[] = [];

		constructor(text: string, private delegate_: FBXParserDelegate) {
			this.tokenizer_ = new FBXTextTokenizer(text);
		}


		private unexpected(t: Token) {
			if (t.type == TokenType.Invalid) {
				this.delegate_.error("Invalid token", t.offset, t.val.toString());
			}
			else {
				this.delegate_.error("Unexpected token", t.offset, t.val.toString());
			}
			
			this.eof_ = true;
		}


		private reportBlock(): FBXBlockAction {
			assert(this.values_.length > 0);

			var blockName = <string>this.values_[0];
			var blockAction = FBXBlockAction.Enter;

			// The delegate contract does not care about "a:" pseudo-blocks or
			// the "Properties70:" block
			if (this.array_ == null) {
				if (blockName == "Properties70") {
					this.inProp70Block_ = true;
				}
				else {
					if (this.depth_ <= this.skippingUntilDepth_) {
						blockAction = this.delegate_.block(blockName, this.values_.slice(1));
					}
				}
				this.values_ = [];
			}

			return blockAction;
		}


		private reportProperty() {
			assert(this.values_.length > 0);

			var propName = <string>this.values_[0];
			var values = this.values_.slice(1);

			if (this.depth_ <= this.skippingUntilDepth_) {
				if (this.inProp70Block_) {
					assert(propName == "P", "Only P properties are allowed in a Properties70 block.");
					let p70p = interpretProp70P(values);
					this.delegate_.typedProperty(p70p.name, p70p.type, p70p.typeName, p70p.values);
				}
				else {
					this.delegate_.property(propName, values);
				}
			}

			this.values_ = [];
		}


		private arrayForKey(key: string, elementCount: number): TypedArray {
			if (key == "PolygonVertexIndex" ||
				key == "UVIndex" ||
				key == "Edges" ||
				key == "Materials" ||
				key == "KeyAttrFlags" ||
				key == "KeyAttrRefCount")
			{
				return new Int32Array(elementCount);
			}

			if (key == "KeyValueFloat" ||
				key == "KeyAttrDataFloat")
			{
				return new Float32Array(elementCount);
			}

			if (key == "Vertices" ||
				key == "Normals" ||
				key == "NormalsW" ||
				key == "UV" ||
				key == "KeyTime")
			{
				return new Float64Array(elementCount);
			}

			console.warn("Unknown array key " + key + ", making default Float64 array.");
			return new Float64Array(elementCount);
		}


		parse() {
			do {
				var token = this.tokenizer_.nextToken();	

				switch (token.type) {
					case TokenType.Key:
						if (this.expect_ & Expect.Key) {
							if (this.expectNextKey_ == null || this.expectNextKey_ == token.val) {
								if (token.val != "a") {
									if (this.values_.length > 0) {
										// since we don't track newlines, we need to deal with 2 normal properties
										// after each other. The Key indicates the end of the current property.
										this.reportProperty();
									}

									this.values_.push(token.val);
								}

								this.expect_ = Expect.ValueOrOpen;
								this.expectNextKey_ = null;
							}
							else {
								return this.unexpected(token);
							}
						}
						else {
							return this.unexpected(token);
						}
						break;

					case TokenType.String:
						// [[fallthrough]]
					case TokenType.Number:
						if ((this.expectNextKey_ == null) && (this.expect_ & Expect.Value)) {
							if (this.array_) {
								// in Array mode, fill delegate-provided array with numbers
								if (token.type != TokenType.Number) {
									this.delegate_.error("Only numbers are allowed in arrays", token.offset, token.val.toString());
									return;
								}

								this.array_[this.arrayIndex_++] = <number>token.val;

								if (this.arrayIndex_ == this.arrayLength_) {
									this.values_.push(this.array_);
									this.expect_ = Expect.Close;
								}
								else {
									this.expect_ = Expect.Comma;	
								}
							}
							else {
								this.values_.push(token.val);
								this.expect_ = Expect.CommaOrOpenOrKey;
							}

							if (this.depth_ > 0) {
								this.expect_ |= Expect.Close;
							}
						}
						else {
							return this.unexpected(token);
						}
						break;

					case TokenType.ArrayCount:
						if ((this.expectNextKey_ == null) && (this.expect_ == Expect.ValueOrOpen)) {
							// -- create an ArrayBuffer to fill; TODO: create appropriate view based on current field name
							this.array_ = this.arrayForKey(<string>this.values_[0], <number>token.val);
							this.arrayIndex_ = 0;
							this.arrayLength_ = this.array_.length;

							// -- we're expecting a context open and then immediately an "a:" field
							this.expect_ = Expect.Open;
							this.expectNextKey_ = "a";
						}
						else {
							return this.unexpected(token);
						}

						break;

					case TokenType.OpenBlock:
						if (this.expect_ & Expect.Open) {
							let blockAction = this.reportBlock();
							if (blockAction == FBXBlockAction.Skip) {
								this.skippingUntilDepth_ = this.depth_;
							}
							this.depth_++;

							this.expect_ = Expect.Key;
							if (this.expectNextKey_ == null) {
								this.expect_ |= Expect.Close;
							}
						}
						else {
							this.unexpected(token);
						}
						break;

					case TokenType.CloseBlock:
						if ((this.expectNextKey_ == null) && (this.expect_ & Expect.Close)) {
							if (this.values_.length > 0) {
								this.reportProperty();
							}
							// The delegate contract does not care about "a:" pseudo-blocks or
							// the "Properties70:" block
							if (this.array_) {
								this.array_ = null;
							}
							else if (this.inProp70Block_) {
								this.inProp70Block_ = false;
							}
							else if (this.depth_ <= this.skippingUntilDepth_) {
								this.delegate_.endBlock();
							}

							this.depth_--;
							if (this.depth_ == this.skippingUntilDepth_) {
								this.skippingUntilDepth_ = 1000;
							}


							this.expect_ = Expect.Key;
							if (this.depth_ > 0) {
								this.expect_ |= Expect.Close;
							}
						}
						else {
							this.unexpected(token);
						}
						break;

					case TokenType.Comma:
						if ((this.expectNextKey_ == null) && (this.expect_ & Expect.Comma)) {
							this.expect_ = Expect.Value;
						}
						else {
							this.unexpected(token);
						}
						break;

					case TokenType.Invalid:
						this.unexpected(token);
						break;

					case TokenType.EOF:
						this.eof_ = true;
						break;
				}

			} while (!this.eof_);
		}
	}

} // sd.asset.fbx
