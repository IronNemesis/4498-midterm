---
name: "rubric-to-step-plan"
description: "Turn a group project rubric, due date, and team profiles into small, owned, dated steps that cover every graded criterion."
---

# rubric-to-step-plan

## User inputs
The rubric text (criteria and points), the project due date, and a profile for each teammate (free-text skills and preferences, plus weekly availability in hours). If a criterion is too vague to size, or availability is missing, ask for it instead of guessing.

## Procedure
1. List every graded criterion with its points.
2. Break each criterion into concrete steps of 2 hours or less. Each step names a specific action and a "done" condition.
3. Order steps by dependency. Mark which steps must finish before others can start.
4. Assign each step an owner using the teammates' stated skills, preferences, and weekly availability. Do not give anyone more hours in a week than they have available.
5. Give each step a due date. Schedule backward from the due date and leave the final step at least 2 days before it.
6. Write one sentence per assignment saying why that person.
7. Flag any criterion you could not cover and say why.

## Output
Return JSON: a list of steps, each with `criterion`, `title`, `done_when`, `hours`, `owner`, `due_date`, `depends_on`, and `why_owner`, plus a `flags` list.

## Boundaries
Do not invent rubric criteria. Do not leave any step without an owner and due date. Do not exceed a teammate's stated availability. Do not contact teammates or change an approved plan; only produce a draft for the team to approve.
