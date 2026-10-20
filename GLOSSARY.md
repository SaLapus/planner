# Planner

A personal planner: Tasks, Events, Habits, Goals and Reviews for one person, edited from the web UI and by Claude.

## Language

### Tasks

**Open Task**:
A Task that is not completed.
_Avoid_: Pending task, unfinished task

**Completed Task**:
A Task marked done. Completing a repeating Task leaves it completed and creates its next instance as a new Open Task.
_Avoid_: Done task, closed task

**Start date**:
The day a Task becomes relevant; until then it stays out of the way. Every Task has one; when none is given it is the day the Task was created, or its due date if that is earlier. Separate from the Time block, which is a planned slot on the calendar.
_Avoid_: Defer date, scheduled date, begin date

**Active Task**:
An Open Task whose Start date is today or earlier: something to work on now.
_Avoid_: Current task, started task

### Schedule

**Week**:
Monday to Sunday, in the Home time zone. "The current Week" is the one that contains today.
_Avoid_: Next 7 days, rolling week
