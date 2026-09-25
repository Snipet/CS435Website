/**
 * stepTM (Intro, slides 15–17), condensed to one screen, with the lines each
 * phase of the current instruction runs. `iarg1` … `iarg3` stand for
 * `currentinstruction.iarg1` … `iarg3`.
 */
import type { Granularity, MachineView } from './view';

export interface CodeLine {
	text: string;
	/** Which part of stepTM the line belongs to. */
	tag: string;
}

const L = (text: string, tag: string): CodeLine => ({ text, tag });

export const STEP_TM: readonly CodeLine[] = [
	L('STEPRESULT stepTM (void)', ''),
	L('{', ''),
	L('  pc = reg[PC_REG];', 'fetch'),
	L('  if ((pc < 0) || (pc > IADDR_SIZE))', 'fetch'),
	L('    return srIMEM_ERR;', 'imem-err'),
	L('  reg[PC_REG] = pc + 1;', 'fetch-ok'),
	L('  currentinstruction = iMem[pc];', 'fetch-ok'),
	L('', ''),
	L('  switch (opClass(currentinstruction.iop)) {', 'decode'),
	L('  case opclRR:', 'dec-RR'),
	L('    r = iarg1; s = iarg2; t = iarg3;', 'dec-RR'),
	L('    break;', 'dec-RR'),
	L('  case opclRM:', 'dec-RM'),
	L('    r = iarg1; s = iarg3; m = iarg2 + reg[s];', 'dec-RM'),
	L('    if ((m < 0) || (m > DADDR_SIZE))', 'dec-RM'),
	L('      return srDMEM_ERR;', 'dmem-err'),
	L('    break;', 'dec-RM-ok'),
	L('  case opclRA:', 'dec-RA'),
	L('    r = iarg1; s = iarg3; m = iarg2 + reg[s];', 'dec-RA'),
	L('    break;', 'dec-RA'),
	L('  }', 'decode'),
	L('', ''),
	L('  switch (currentinstruction.iop) {', 'execute'),
	L('  case opHALT:', 'op-HALT'),
	L('    printf("HALT: %1d,%1d,%1d\\n", r, s, t);', 'op-HALT'),
	L('    return srHALT;', 'op-HALT'),
	L('  case opIN:', 'op-IN'),
	L('    do {', 'op-IN'),
	L('      printf("Enter value for IN instruction: ");', 'op-IN'),
	L('      ok = getNum();', 'op-IN'),
	L('      if (!ok) printf("Illegal value\\n");', 'op-IN'),
	L('      else reg[r] = num;', 'op-IN'),
	L('    } while (!ok);', 'op-IN'),
	L('    break;', 'op-IN'),
	L('  case opOUT:', 'op-OUT'),
	L('    printf("OUT instruction prints: %d\\n", reg[r]);', 'op-OUT'),
	L('    break;', 'op-OUT'),
	L('  case opADD: reg[r] = reg[s] + reg[t]; break;', 'op-ADD'),
	L('  case opSUB: reg[r] = reg[s] - reg[t]; break;', 'op-SUB'),
	L('  case opMUL: reg[r] = reg[s] * reg[t]; break;', 'op-MUL'),
	L('  case opDIV:', 'op-DIV'),
	L('    if (reg[t] != 0) reg[r] = reg[s] / reg[t];', 'op-DIV'),
	L('    else return srZERODIVIDE;', 'div-zero'),
	L('    break;', 'op-DIV-ok'),
	L('  case opLD:  reg[r] = dMem[m]; break;', 'op-LD'),
	L('  case opST:  dMem[m] = reg[r]; break;', 'op-ST'),
	L('  case opLDA: reg[r] = m; break;', 'op-LDA'),
	L('  case opLDC: reg[r] = currentinstruction.iarg2; break;', 'op-LDC'),
	L('  case opJLT: if (reg[r] <  0) reg[PC_REG] = m; break;', 'op-JLT'),
	L('  case opJLE: if (reg[r] <= 0) reg[PC_REG] = m; break;', 'op-JLE'),
	L('  case opJGT: if (reg[r] >  0) reg[PC_REG] = m; break;', 'op-JGT'),
	L('  case opJGE: if (reg[r] >= 0) reg[PC_REG] = m; break;', 'op-JGE'),
	L('  case opJEQ: if (reg[r] == 0) reg[PC_REG] = m; break;', 'op-JEQ'),
	L('  case opJNE: if (reg[r] != 0) reg[PC_REG] = m; break;', 'op-JNE'),
	L('  }', 'execute'),
	L('  return srOKAY;', 'okay'),
	L('}', '')
];

/** Tags of the lines one phase of the view's instruction runs. */
export function phaseTags(view: MachineView, phase: 1 | 2 | 3): Set<string> {
	const rec = view.record;
	const tags = new Set<string>();
	if (!rec) return tags;
	if (phase === 1) {
		tags.add('fetch');
		if (rec.kind === 'step' && !rec.instr) tags.add('imem-err');
		else tags.add('fetch-ok');
		return tags;
	}
	const cls = rec.kind === 'waiting' ? 'RR' : rec.cls;
	if (!cls) return tags;
	if (phase === 2) {
		tags.add('decode').add(`dec-${cls}`);
		if (cls === 'RM')
			tags.add(rec.kind === 'step' && rec.result === 'srDMEM_ERR' ? 'dmem-err' : 'dec-RM-ok');
		return tags;
	}
	if (rec.kind !== 'step' || !rec.instr) return tags;
	const op = rec.instr.op;
	tags.add('execute').add(`op-${op}`);
	if (op === 'DIV') tags.add(rec.result === 'srZERODIVIDE' ? 'div-zero' : 'op-DIV-ok');
	if (rec.result === 'srOKAY') tags.add('okay');
	return tags;
}

/**
 * Lines to mark for a view: `active` for the phase just carried out (the whole
 * instruction when stepping by instruction), `path` for its earlier phases.
 */
export function stepTMLines(
	view: MachineView,
	mode: Granularity
): { active: Set<number>; path: Set<number> } {
	const active = new Set<number>();
	const path = new Set<number>();
	if (!view.record || view.phase === 0) return { active, path };
	const mark = (tags: Set<string>, into: Set<number>) => {
		STEP_TM.forEach((line, i) => {
			if (line.tag && tags.has(line.tag)) into.add(i);
		});
	};
	const whole = mode === 'instruction' && view.phase === 3;
	for (let p = 1; p <= view.phase; p++) {
		const phase = p as 1 | 2 | 3;
		mark(phaseTags(view, phase), whole || p === view.phase ? active : path);
	}
	return { active, path };
}

/**
 * The line to bring into view: where the block the latest phase ran starts
 * (the executed case, the decode case, or the fetch), or its error return.
 */
export function stepTMFocus(view: MachineView): number | null {
	const rec = view.record;
	if (!rec || view.phase === 0) return null;
	let tag: string | null = null;
	if (view.phase === 1) {
		tag = rec.kind === 'step' && !rec.instr ? 'imem-err' : 'fetch';
	} else if (view.phase === 2) {
		const failed = rec.kind === 'step' && rec.result === 'srDMEM_ERR';
		tag = failed ? 'dmem-err' : `dec-${rec.kind === 'waiting' ? 'RR' : rec.cls}`;
	} else if (rec.kind === 'step' && rec.instr) {
		tag = `op-${rec.instr.op}`;
	}
	const i = STEP_TM.findIndex((l) => l.tag === tag);
	return i < 0 ? null : i;
}
