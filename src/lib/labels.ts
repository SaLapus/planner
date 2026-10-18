// Russian names for entity types and change-log actions, used by the Trash and Change log pages.
// A new entity area adds ONE line to ENTITY_NAMES; unknown types simply show their code name.
export const ENTITY_NAMES: Record<string, string> = {
	task: 'Задача',
	project: 'Проект',
	event: 'Событие'
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
	reorder_subtasks: 'порядок подзадач'
};

export const entityName = (type: string) => ENTITY_NAMES[type] ?? type;

/** 'task.complete.undo' -> 'Задача: отмена (выполнение)'. */
export function actionName(action: string): string {
	const [type, verb, undo] = action.split('.');
	const what = VERBS[verb] ?? verb;
	return undo === 'undo' ? `${entityName(type)}: отмена (${what})` : `${entityName(type)}: ${what}`;
}

export const ACTOR_NAMES = { owner: 'Я', claude: 'Claude' } as const;
