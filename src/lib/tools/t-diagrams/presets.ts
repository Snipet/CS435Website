/**
 * T-diagram scenarios from Intro (cont’d), slides 3–8: the generic compiler,
 * a cross compiler, a retargetable compiler, and bootstrapping.
 */
import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';
import type { SubsetDecl, TDiagram } from './model';
import { BOOTSTRAP_FACTS, COMPILER_IN_SUBSET, QUICK_COMPILER, WANT } from './walkthrough';

export interface TDiagramsPresetValue {
	toolbox: TDiagram[];
	subsets: SubsetDecl[];
	/** Comma-separated languages that run directly. */
	runnable: string;
	goal: TDiagram | null;
	/** Show the step-by-step walkthrough of slide 8. */
	guide: 'bootstrap' | null;
}

/** A question posed on a slide, with its answer behind "Show answer". */
export interface SlideQuestion {
	prompt: string;
	answer: string;
	/** Where the question is asked, when it is not the preset's own slide. */
	cite?: Citation;
}

export interface TDiagramsPreset extends Preset<TDiagramsPresetValue> {
	question?: SlideQuestion;
}

export const presets: readonly TDiagramsPreset[] = [
	{
		id: 'generic',
		label: 'Compiler from S to T in H',
		description:
			'A compiler translates from language S to T and is written in the host language H: S at the top-left, T at the top-right, H in the stem.',
		cite: { deck: '02', slide: 3 },
		value: {
			toolbox: [{ source: 'S', target: 'T', host: 'H' }],
			subsets: [],
			runnable: '',
			goal: null,
			guide: null
		}
	},
	{
		id: 'cross',
		label: 'Cross compiler',
		description:
			'A cross compiler compiles language L to machine language M_OTHER while it runs on a different machine, M_NATIVE. The goal is the slide’s cross compiler; the toolbox holds an L → M_OTHER compiler written in L and a native L compiler.',
		cite: { deck: '02', slide: 4 },
		value: {
			toolbox: [
				{ source: 'L', target: 'M_OTHER', host: 'L' },
				{ source: 'L', target: 'M_NATIVE', host: 'M_NATIVE' }
			],
			subsets: [],
			runnable: 'M_NATIVE',
			goal: { source: 'L', target: 'M_OTHER', host: 'M_NATIVE' },
			guide: null
		},
		question: {
			prompt: 'Example?',
			answer:
				'A compiler that runs on an x86 desktop and produces ARM code for a phone or an embedded board, T(C → ARM / x86). The program it compiles runs on the other machine, not on the one that compiled it.'
		}
	},
	{
		id: 'retargetable',
		label: 'Retargetable compiler',
		description:
			'One C compiler written in C++, built to produce code for different ISAs: x86 and ARMv9. The third diagram is a C++ compiler that runs on x86; composing either C compiler with it gives a C compiler that runs on x86.',
		cite: { deck: '02', slide: 5 },
		value: {
			toolbox: [
				{ source: 'C', target: 'x86', host: 'C++' },
				{ source: 'C', target: 'ARMv9', host: 'C++' },
				{ source: 'C++', target: 'x86', host: 'x86' }
			],
			subsets: [],
			runnable: 'x86',
			goal: null,
			guide: null
		},
		question: {
			prompt: 'Examples?',
			answer: 'GNU Compiler Collection (GCC), LLVM.'
		}
	},
	{
		id: 'bootstrap',
		label: 'Bootstrapping a compiler',
		description:
			'Given machine M and language L, build T(L → M / M) from an L → M compiler written in L′ and a quick L′ compiler written in M. L′ is a simple subset of L; M′ is inefficient M-code, which runs on M.',
		cite: { deck: '02', slide: 8 },
		value: {
			toolbox: [{ ...COMPILER_IN_SUBSET }, { ...QUICK_COMPILER }],
			subsets: BOOTSTRAP_FACTS.subsets.map((d) => ({ ...d })),
			runnable: BOOTSTRAP_FACTS.runnable.join(', '),
			goal: { ...WANT },
			guide: 'bootstrap'
		},
		question: {
			prompt: 'But what about first compilers?',
			answer:
				'A compiler for L can be written in L itself without a pre-existing L compiler: write it in a simple subset L′, compile it once with a quick L′ compiler written in machine code, then compile it again with the result. That is bootstrapping.',
			cite: { deck: '02', slide: 7 }
		}
	}
];

export const DEFAULT_PRESET_ID = 'bootstrap';

export function presetById(id: string): TDiagramsPreset | undefined {
	return presets.find((p) => p.id === id);
}
