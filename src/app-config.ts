import { prebuiltAppConfig } from '@mlc-ai/web-llm';

export const modelLibURLPrefix =
	'https://raw.githubusercontent.com/neigeantre/web-llm-croissantllm-libraries/main/';
export const modelHFURLPrefix = 'https://huggingface.co/croissantllm/';

const models = [
	'CroissantLLMChat-v0.1-q0f16',
	'CroissantLLMChat-v0.1-q0f32',
	'CroissantLLM_ft_translation_correction-q0f16',
];

export const appConfig = {
	model_list: [
		...prebuiltAppConfig.model_list,
		{
			model_url: modelHFURLPrefix + models[0] + '-MLC/resolve/main/',
			model_id: models[0],
			model_lib_url: modelLibURLPrefix + models[0] + '-webgpu.wasm',
		},
		{
			model_url: modelHFURLPrefix + models[1] + '-MLC/resolve/main/',
			model_id: models[1],
			model_lib_url: modelLibURLPrefix + models[1] + '-webgpu.wasm',
		},
		{
			model_url: modelHFURLPrefix + models[2] + '-MLC/resolve/main/',
			model_id: models[2],
			model_lib_url:
				modelLibURLPrefix + 'CroissantLLMChat-v0.1-q0f16' + '-webgpu.wasm',
		},
	],
	useIndexedDBCache: true,
};
