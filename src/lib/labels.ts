// Russian names for entity types and change-log actions, used by the Trash and Change log pages.
// A new entity area adds ONE line to ENTITY_NAMES; unknown types simply show their code name.
export const ENTITY_NAMES: Record<string, string> = {
	task: 'Задача',
	project: 'Проект',
	habit: 'Привычка',
	checkin: 'Отметка привычки',
	event: 'Событие',
	goal: 'Цель',
	milestone: 'Этап цели',
	review: 'Обзор',
	feed: 'Календарная лента'
};

const VERBS: Record<string, string> = {
	create: 'создание',
	update: 'изменение',
	complete: 'выполнение',
	uncomplete: 'возврат в работу',
	delete: 'удаление в корзину',
	restore: 'восстановление',
	rename: 'переименование',
	archive: 'архивирование',
	unarchive: 'возврат из архива',
	set_project: 'смена проекта',
	add_tag: 'добавление тега',
	remove_tag: 'удаление тега',
	add_subtask: 'добавление подзадачи',
	check_subtask: 'отметка подзадачи',
	uncheck_subtask: 'снятие отметки подзадачи',
	remove_subtask: 'удаление подзадачи',
	reorder_subtasks: 'порядок подзадач',
	add: 'добавление',
	set_status: 'смена статуса',
	reorder_milestones: 'порядок этапов',
	set_milestone: 'связь с этапом цели',
	set_goal: 'связь с целью',
	regenerate: 'новая секретная ссылка',
	split: 'разделение серии',
	'occurrence.update': 'изменение одного повтора',
	'occurrence.cancel': 'отмена одного повтора'
};

export const entityName = (type: string) => ENTITY_NAMES[type] ?? type;

/** 'task.complete.undo' -> 'Задача: отмена (выполнение)'. */
export function actionName(action: string): string {
	const parts = action.split('.');
	const undo = parts.at(-1) === 'undo';
	const type = parts[0];
	const verb = parts.slice(1, undo ? -1 : undefined).join('.');
	const what = VERBS[verb] ?? verb;
	return undo ? `${entityName(type)}: отмена (${what})` : `${entityName(type)}: ${what}`;
}

export const ACTOR_NAMES = { owner: 'Я', claude: 'Claude' } as const;
