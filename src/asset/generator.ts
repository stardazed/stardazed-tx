// asset/identifier - complete missing asset identification based on minimal info
// Part of Stardazed
// (c) 2015-2017 by Arthur Langereis - @zenmumbler
// https://github.com/stardazed/stardazed

namespace sd.asset {

	export interface Asset {
		generator?: string;
	}		
	
	/**
	 * Extend an AssetPipeline with the capacity to generate assets on the fly.
	 */
	export const generatorStage: AssetPipelineStage = (pipeline: AssetPipeline) => {
		const generatorProcessor: AssetProcessor = (asset: Asset) =>
			new Promise<Asset>((resolve, reject) => {
				const genType = asset.generator;
				if (typeof genType === "string" && genType.length > 0) {
					let config = asset.metadata;
					if (typeof config === "object" || config === void 0) {
						config = config || {};
					}
					else {
						return reject(`Asset Generator: metadata must be absent or an object.`);
					}

					resolve(generator.generateAsset(genType, config).then(
						replacement => {
							// remove generator info
							delete asset.generator;
							delete asset.metadata;
							// override any properties the generated asset defines
							container.override(asset, replacement);
							return asset;
						}
					));
				}
				else {
					resolve(asset);
				}
			});

		// place next processor at end of chain
		const process = pipeline.process;
		pipeline.process = (asset: Asset) => process(asset).then(generatorProcessor);
	};

	export namespace generator {

		export type AssetGenerator = <Config extends object = any>(options: Config) => Promise<Asset>;

		const generators = new Map<string, AssetGenerator>();

		/**
		 * @internal
		 */
		export const registerGenerator = (type: string, gen: AssetGenerator) => {
			assert(! generators.has(type), `Tried to register duplicate AssetGenerator of type "${type}"`);
			generators.set(type, gen);
		};
		
		export const generateAsset = (type: string, config: object): Promise<Asset> =>
			new Promise<Asset>((resolve, reject) => {
				const assetGen = generators.get(type);
				if (! assetGen) {
					return reject(`Asset Generator: no generator registered for type "${type}"`);
				}
				resolve(assetGen(config));
			});

	} // ns generator

} // ns sd.asset
