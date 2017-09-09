// asset/parser/group - group asset parser front-end
// Part of Stardazed
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed

/// <reference path="../parsers.ts" />

namespace sd.asset {

	export namespace parser {

		export interface GroupAssetOptions {
			loader: loader.Loader;
		}
		
		export type GroupAssetParser = AssetParser<AssetGroup, Partial<GroupAssetOptions>>;
		const groupParsers = new Map<string, GroupAssetParser>();
		
		export function registerGroupParser(groupParser: GroupAssetParser, mimeType: string) {
			assert(! groupParsers.has(mimeType), `Trying to register more than 1 group parser for mime-type: ${mimeType}`);
			groupParsers.set(mimeType, groupParser);
		}
		
		/**
		 * Create an AssetGroup for an asset blob
		 * @param resource The source data to be parsed
		 */
		export function parseGroup(resource: RawAsset<GroupAssetOptions>) {
			return new Promise<AssetGroup>((resolve, reject) => {
				const mimeType = resource.blob.type;
				const groupParser = groupParsers.get(mimeType);
				if (! groupParser) {
					return reject(`Cannot load groups of type: ${mimeType}`);
				}
				resolve(groupParser(resource));
			});
		}

	} // ns parser

	export interface Library {
		loadGroup(sa: SerializedAsset): Promise<AssetGroup>;
	}

	const GroupAsset = <T extends Constructor<LibraryBase>>(Lib: T) =>
		class extends Lib {
			loadImage(sa: SerializedAsset) {
				return this.loadData(sa).then(resource => parser.parseGroup(resource));
			}
		};

	addLibraryExtension(GroupAsset);

} // ns sd.asset
