# «+ Task» — what it can't do today, and the small change that would fix it

*(For discussion with Mr. Fitros. Not built.)*

## In plain words
Today, every «task» in the CRM belongs to a **customer case**. When someone presses «+ Task», they must pick a case.

So these things **cannot** be added as tasks today:
- a reminder that isn't about a specific customer, e.g. «Κλήση στον πάροχο για τις προμήθειες» or «Ετοιμασία παρουσίασης»;
- a reminder for a **new lead** that hasn't become a case yet, e.g. «Κάλεσε τον κ. Παπαδόπουλο αύριο»;
- a reminder for a customer who has no open case right now, e.g. a renewal call next year;
- a task for the whole team rather than one person.

Tasks also can't repeat (e.g. «every Monday»).

## The small change that would lift it
One **additive** database change — nothing deleted, existing tasks keep working:
- allow a task to have **no case** (today a case is mandatory);
- add two optional links, **lead** and **customer**, so a task can belong to a lead, a customer, a case, or nothing.

«+ Task» then gets a «Σχετικό με» choice: none / lead / customer / case. Tasks without a case show in «Η εργασία μου» like any other.

Repeating tasks and team tasks would be a further, separate step.

**Rough size:** about 1–2 days including tests (estimate, not a quote).
