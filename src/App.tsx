import { useEffect, useState } from 'react';
import { ActionIcon, Button, Textarea, Tooltip } from '@mantine/core';
import { IconSwitchHorizontal, IconSwitchVertical } from '@tabler/icons-react';
import {
	ChatCompletionMessageParam,
	CreateWebWorkerEngine,
	EngineInterface,
	InitProgressReport,
	hasModelInCache,
} from '@mlc-ai/web-llm';

import './App.css';
import { appConfig } from './app-config';
import Progress from './components/Progress';
import { promt_description } from './prompt';

declare global {
	interface Window {
		chrome?: unknown;
	}
}

appConfig.useIndexedDBCache = true;

if (appConfig.useIndexedDBCache) {
	console.log('Using IndexedDB Cache');
} else {
	console.log('Using Cache API');
}

function App() {
	const selectedModel = 'CroissantLLM_ft_translation_correction-q0f16';
	const [engine, setEngine] = useState<EngineInterface | null>(null);
	const [progress, setProgress] = useState('Not loaded');
	const [progressPercentage, setProgressPercentage] = useState(0);
	const [isFetching, setIsFetching] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [runtimeStats, setRuntimeStats] = useState('');
	const [input, setInput] = useState<string>('');
	const [output, setOutput] = useState<string>('');
	const [modelInCache, setModelInCache] = useState<boolean | null>(null);
	const [switched, setSwitched] = useState<boolean>(false);
	const [errorBrowserMessage, setErrorBrowserMessage] = useState<string | null>(
		null
	);

	useEffect(() => {
		const compatibleBrowser = checkBrowser();
		checkModelInCache();
		if (!engine && compatibleBrowser) {
			loadEngine();
		}
	}, []);

	useEffect(() => {
		setInput(output);
		onSend(output);
		setOutput('');
	}, [switched]);

	/**
	 * Check if the browser is compatible with WebGPU.
	 */
	const checkBrowser = () => {
		const userAgent = navigator.userAgent;
		let compatibleBrowser = true;

		const isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(
			userAgent
		);

		if (isMobile) {
			setErrorBrowserMessage(
				'Les téléphones mobiles ne sont pas compatibles avec WebGPU.'
			);
			compatibleBrowser = false;
		} else if (/firefox|fxios/i.test(userAgent)) {
			setErrorBrowserMessage("Firefox n'est pas compatible avec WebGPU.");
			compatibleBrowser = false;
		} else if (
			/safari/i.test(userAgent) &&
			!/chrome|crios|crmo/i.test(userAgent)
		) {
			setErrorBrowserMessage("Safari n'est pas compatible avec WebGPU.");
			compatibleBrowser = false;
		} else if (!window.chrome) {
			setErrorBrowserMessage(
				"Votre navigatuer n'est pas compatible avec WebGPU."
			);
			compatibleBrowser = false;
		}
		return compatibleBrowser;
	};

	/**
	 * Callback for the progress of the model initialization.
	 */
	const initProgressCallback = (report: InitProgressReport) => {
		if (
			modelInCache === true ||
			report.text.startsWith('Loading model from cache')
		) {
			setOutput('Chargement du modèle dans la RAM...');
		} else {
			setOutput(
				'Téléchargement des poids du modèle dans le cache de votre navigateur, cela peut prendre quelques minutes.'
			);
		}

		if (report.progress !== 0) {
			setProgressPercentage(report.progress);
		}
		if (report.progress === 1) {
			setProgressPercentage(0);
			setOutput('');
		}
		setProgress(report.text);
	};

	/**
	 * Load the engine.
	 */
	const loadEngine = async () => {
		setIsFetching(true);
		setOutput('Chargement du modèle...');

		const engine: EngineInterface = await CreateWebWorkerEngine(
			new Worker(new URL('./worker.ts', import.meta.url), {
				type: 'module',
			}),
			selectedModel,
			{ initProgressCallback: initProgressCallback, appConfig: appConfig }
		);
		setIsFetching(false);
		setEngine(engine);
		const isInChache = await hasModelInCache(selectedModel, appConfig);
		setModelInCache(isInChache);
		return engine;
	};

	/**
	 * Send the input to the engine and get the output text translated.
	 */
	const onSend = async (inputUser: string) => {
		if (inputUser === '') {
			return;
		}
		setIsGenerating(true);
		setOutput('');

		let loadedEngine = engine;

		if (!loadedEngine) {
			try {
				loadedEngine = await loadEngine();
			} catch (error) {
				setIsGenerating(false);
				console.log(error);
				setOutput('Could not load the model because ' + error);
				return;
			}
		}

		const paragraphs = inputUser.split('\n');

		try {
			await loadedEngine.resetChat();

			let assistantMessage = '';

			for (let i = 0; i < paragraphs.length; i++) {
				const paragraph = paragraphs[i];

				if (paragraph === '') {
					assistantMessage += '\n';
					setOutput((prevOutput) => prevOutput + '\n');
				} else {
					const words = paragraph.split(' ');
					let prompt = '';
					if (words.length > 5) {
						prompt = switched
							? promt_description.promptSentenceEnglishToFrench
							: promt_description.promptSentenceFrenchToEnglish;
					} else {
						prompt = switched
							? promt_description.promptEnglishToFrench
							: promt_description.promptFrenchToEnglish;
					}
					const userMessage: ChatCompletionMessageParam = {
						role: 'user',
						content: prompt + paragraph,
					};
					const completion = await loadedEngine.chat.completions.create({
						stream: true,
						messages: [userMessage],
					});
					let translatedParagraph = '';

					for await (const chunk of completion) {
						const curDelta = chunk.choices[0].delta.content;
						if (curDelta) {
							translatedParagraph += curDelta;
							setOutput((prevOutput) => prevOutput + curDelta);
						}
					}

					if (i < paragraphs.length - 1) {
						assistantMessage += translatedParagraph + '\n';
						setOutput((prevOutput) => prevOutput + '\n');
					} else {
						assistantMessage += translatedParagraph;
					}
				}
			}

			setOutput(assistantMessage);
			setIsGenerating(false);
			setRuntimeStats(await loadedEngine.runtimeStatsText());
		} catch (error) {
			setIsGenerating(false);
			console.log('EXECPTION');
			console.log(error);
			setOutput('Error. Please try again.');
			return;
		}
	};

	/**
	 * Reset the chat engine and the user input.
	 */
	const reset = async () => {
		if (!engine) {
			console.log('Engine not loaded');
			return;
		}
		await engine.resetChat();
		setInput('');
		setOutput('');
	};

	/**
	 * Stop the generation.
	 */
	const onStop = () => {
		if (!engine) {
			console.log('Engine not loaded');
			return;
		}

		setIsGenerating(false);
		engine.interruptGenerate();
	};

	/**
	 * Check if the model is in the cache.
	 */
	const checkModelInCache = async () => {
		const isInChache = await hasModelInCache(selectedModel, appConfig);
		setModelInCache(isInChache);
		console.log(`${selectedModel} in cache : ${isInChache}`);
	};

	return (
		<>
			<h1>Traduction Anglais/Français</h1>
			<h2>Un service 100% souverain et confidentiel</h2>
			<p>
				Cette traduction est le résultat d'un traitement local dans votre
				navigateur. Vos données ne quittent pas votre ordinateur et ne
				transitent par aucun serveur.
			</p>
			{errorBrowserMessage && (
				<p className='text-error'>
					{errorBrowserMessage} Veuillez consulter{' '}
					<a href='https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility'>
						<span className='underline'>cette page</span>
					</a>{' '}
					pour voir la compatibilité avec les navigateurs.
				</p>
			)}

			{modelInCache !== null && (
				<p>
					Modèle téléchargé dans le cache de votre navigateur :{' '}
					{modelInCache === true ? '✅' : '❌'}
				</p>
			)}

			<div className='textbox-container'>
				<Textarea
					value={input}
					onChange={(e) => setInput(e.currentTarget.value)}
					autosize
					minRows={15}
					maxRows={15}
					disabled={isFetching}
					variant='filled'
					size='lg'
					label={switched ? 'Anglais' : 'Français'}
					placeholder='Écrivez ou collez votre texte ici.'
					className='textarea'
				/>

				<div>
					<div className='horizontal-switch-button'>
						<Tooltip label='Intervertir les langues source et cible'>
							<ActionIcon
								variant='transparent'
								color='black'
								size='xl'
								data-disabled={isFetching || isGenerating}
								onClick={() => setSwitched((prevState) => !prevState)}
								className='switch-button'
							>
								<IconSwitchHorizontal style={{ width: '90%', height: '90%' }} />
							</ActionIcon>
						</Tooltip>
					</div>
					<div className='vertical-switch-button'>
						<Tooltip label='Intervertir les langues source et cible'>
							<ActionIcon
								variant='transparent'
								color='black'
								size='xl'
								disabled={isFetching || isGenerating}
								onClick={() => setSwitched((prevState) => !prevState)}
								className='switch-button'
							>
								<IconSwitchVertical style={{ width: '90%', height: '90%' }} />
							</ActionIcon>
						</Tooltip>
					</div>
				</div>

				<Textarea
					value={output}
					autosize
					minRows={15}
					maxRows={15}
					disabled={isFetching}
					variant='filled'
					size='lg'
					label={switched ? 'Français' : 'Anglais'}
					className='textarea'
				/>
			</div>

			<div className='button-container'>
				<Button
					variant='light'
					color='black'
					onClick={reset}
					disabled={isGenerating || isFetching}
					loading={isFetching}
				>
					Effacer
				</Button>

				<Button
					variant='light'
					color='black'
					onClick={() => onSend(input)}
					disabled={isGenerating || isFetching}
					loading={isGenerating || isFetching}
				>
					Traduire
				</Button>

				<Button
					variant='light'
					onClick={onStop}
					color='black'
					disabled={!isGenerating}
					loading={isFetching}
				>
					Stop
				</Button>
			</div>

			{progressPercentage !== 0 && (
				<div className='progress-bars-container'>
					<Progress percentage={progressPercentage} />
				</div>
			)}

			<div className='progress-text'>{progress}</div>
			{runtimeStats && <p>Performances : {runtimeStats}</p>}
			<p>
				Motorisé par {''}
				<a href='https://huggingface.co/croissantllm' target='_blank'>
					🥐CroissantLLM
				</a>
				, un LLM souverain par CentraleSupélec.
			</p>
		</>
	);
}

export default App;
