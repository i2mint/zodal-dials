# 03C — Cloud-Native Layering / Merge / Override Engines

**Task:** Study production-grade layering/merge/override engines (Kustomize, Helm, Terraform, Ansible) and the closest app-settings analog (Sourcegraph cascading settings). Extract a precise, minimal merge/precedence model for **zodal-settings**. Dimensions C (cascade/merge) and G (provenance/in-product surfacing).

---

## TL;DR

- Every mature config system converges on the **same skeleton**: an **ordered list of sources** (scopes), each contributing a **partial layer**, merged by a **deterministic algorithm** where **higher precedence wins** [1][6][7][8].
- The two genuinely different merge primitives in the wild are **deep-merge of objects** (recurse on keys) versus **wholesale replace of scalars and arrays**. This is the default in Helm, the default in JSON Merge Patch (RFC 7386), and the *intuitive* (but not the only) behavior in Kustomize [3][5][9].
- **Arrays are the perennial pain point.** RFC 7386 and Helm replace arrays entirely [3][5]. Kubernetes Strategic Merge Patch adds a *Kubernetes-aware* mode: merge lists by a declared key (`patchMergeKey`, e.g. `name`) — but this requires per-field metadata the generic settings case does not have [10][11].
- **Deletion needs an explicit sentinel.** RFC 7386 and Helm both use `null` to mean "remove this key" [3][5]. Kustomize uses `$patch: delete` / `$deleteFromPrimitiveList` directives [10].
- **Two patch standards, two jobs.** **JSON Merge Patch (RFC 7386)** is the right *internal shape* for a layer (compact, declarative, null-deletes) [3]. **JSON Patch (RFC 6902)** is the right shape for *history/audit/undo* (ordered, reversible, `test` for optimistic concurrency) [4].
- **Sourcegraph is the closest app-settings analog**: a JSON-Schema-validated `global → org → user` cascade, surfaced in-product, where higher levels override lower [6][7]. Its merge is documented as level-overrides-level; the public docs are thin on array semantics, so treat that as **unverified** and adopt the RFC 7386 rule explicitly.
- **Recommendation for zodal-settings:** adopt **RFC-7386 deep-merge semantics as the default cascade** (objects recurse, scalars+arrays replace, `null` deletes), make the **merge strategy per-key overridable** (`replace` / `deep-merge` / `append` / `strategic`), store layers as **Merge Patches** and history as **JSON Patches**, and always emit **provenance** (winning scope + shadowed layers) — the thing every one of these engines under-delivers.

---

## The engines, one by one

### 1. Kustomize — bases + overlays + strategic-merge / JSON6902

**Model.** A **base** is a directory with a `kustomization.yaml` and a set of resources; an **overlay** is a directory whose `kustomization.yaml` references one or more bases and layers customizations on top. "A base has no knowledge of an overlay and can be used in multiple overlays" [1][2]. This is a clean **layer/scope separation**: the base is the default layer; each overlay is a higher-precedence partial layer.

**Two patch mechanisms** [1][10][11]:

- **Strategic Merge Patch (SMP)** — a partial document merged with the target; you specify only the fields you want to change. Kubernetes-aware: lists can be *merged by key* rather than replaced.
- **JSON6902 patch** — an ordered op-list (`add`/`remove`/`replace`/`move`/`copy`/`test`) for precise, index-level array edits where SMP is too coarse.

**Merge semantics (the load-bearing detail).** SMP merge of a list is governed by two pieces of field metadata in the Kubernetes Go source [10][11]:
- `patchStrategy`: `merge` or `replace`. **If a field has no `patchStrategy`, the default is `replace`.**
- `patchMergeKey`: which field identifies list elements (e.g. `name` for containers), so elements match irrespective of array position.

Plus directives: `$patch: replace` (replace the element instead of merging), `$patch: delete` (delete a map), `$deleteFromPrimitiveList/<field>` (remove items from a primitive list), `$retainKeys` (whitelist of keys to keep) [10].

**KEEP:** the base/overlay separation = scopes; the *idea* of a per-field merge strategy (`merge` vs `replace`) — this directly maps to zodal's "merge strategy: the per-key rule." The two-tier patch idea (a declarative merge form + an ordered op form) maps cleanly to Merge-Patch-for-layers + JSON-Patch-for-history.
**AVOID:** the Kubernetes-specific machinery — `patchMergeKey`, `$retainKeys`, YAML, and the fact that *list merge requires schema-side Go struct tags*. A generic settings library has no equivalent of those tags; do not try to merge arrays by key by default.

### 2. Helm — values merge + `--set`

**Precedence (ascending).** Chart `values.yaml` < parent/subchart `values.yaml` < user `-f` values file(s) < `--set` flags. The docs state it verbatim: "`values.yaml` is the default, which can be overridden by a parent chart's `values.yaml`, which can in turn be overridden by a user-supplied values file, which can in turn be overridden by `--set` parameters" [5]. Multiple `-f` files: **last one wins** [5].

**Merge semantics.** Maps are **coalesced** (deep-merged): nested keys in later sources override earlier ones; unspecified keys are preserved. **Lists are replaced entirely, not merged** [5][9]. Deletion uses `null`: "you may override the value of the key to be `null`, in which case Helm will remove the key from the overridden values merge" [5].

This is **exactly RFC 7386 semantics** arrived at independently, which is strong corroboration that deep-merge-objects / replace-arrays-and-scalars / null-deletes is the natural default for a config cascade.

**KEEP:** the entire merge rule (it *is* the proposed zodal default); the explicit `null`-deletes sentinel; "last source wins" determinism.
**AVOID:** the `--set` mini-DSL (`a.b.c=val`, list-by-index syntax) — fragile, hard to validate, a known footgun [9]. zodal's escape hatch should be typed config overrides, not a string DSL.

### 3. Terraform — variable precedence + validation blocks

**Precedence (lowest → highest)** [8]: variable `default` < environment variables (`TF_VAR_*`) < `terraform.tfvars` < `*.auto.tfvars` (lexical order, later wins) < `-var` / `-var-file` on the CLI (in order given, **last wins**). HCP/CLI explicit values take top precedence.

**Validation blocks.** A `validation {}` block inside a `variable {}` declares a custom rule (condition + error message); "Terraform executes input variable validations immediately, before generating a plan" [8]. This is the **validate-before-apply** discipline.

**KEEP:** the flat, well-documented, *last-source-wins* precedence list — a model of clarity, exactly the kind of ordered-scope list zodal needs. The **validate-the-merged-result-before-apply** ordering: zodal should validate the *effective* config against the Zod schema (+ cross-field constraints) before live-apply.
**AVOID:** Terraform variables are **flat / non-nested and do not deep-merge** — each source wins atomically per variable. That's simpler than zodal needs (settings have nested/object values), so don't copy the "no merge" stance for object-valued settings.

### 4. Ansible — variable precedence

**Model.** A famously deep **22-level** precedence ladder, lowest to highest: command-line non-`-e` values, role defaults, inventory/group/host vars (many sub-levels), play vars, role vars, block/task vars, `set_facts`, role params, and finally **extra vars (`-e`) which always win** [12][13].

**Key contrast Ansible makes explicit** [12][13]: `roles/x/defaults/main.yml` is **lowest** precedence (meant to be overridden), while `roles/x/vars/main.yml` is **high** precedence (internal, not meant to be overridden). Same *file shape*, opposite *intent*, expressed purely by which scope they live in.

**KEEP:** the conceptual lesson — **precedence is a property of the scope, not the value.** zodal's "default" preset scope and an admin "policy" scope are the same data structurally; their power comes entirely from their position in the ordered scope list. Also: Ansible **replaces** whole variables by default (no deep merge unless `hash_behaviour=merge` is set globally) — a caution that deep-merge should be opt-in-able per key.
**AVOID:** 22 levels. This is the cautionary tale: too many implicit scopes make effective-value reasoning nearly impossible without tooling. zodal should ship **few, named, explicit scopes** (default, preset, profile, workspace, policy) and *always* expose provenance.

### 5. Sourcegraph cascading settings — the closest app-settings analog

**Model.** Three ordered levels: **global** (site admins) → **organization** (org members) → **user** (individual) [6][7]. "Settings can be set at the global level..., the organization level..., and at the individual user level" [6]. Higher levels override lower for that user.

**Schema-driven.** Settings are validated against a **JSON Schema** (`schema/settings.schema.json`) that "contains all available options with their default values, enabling validation of configuration correctness" [6]. This is the single SSOT-schema pattern — the direct precedent for zodal's Zod-schema-as-SSOT.

**In-product surfacing (dimension G).** Sourcegraph exposes each cascade level as an editable JSON document in the UI (Site admin → Global settings; org/user settings via the user menu) and computes a merged "effective" settings object the product reads from [6][7]. **Caveat (unverified):** the public docs do *not* spell out array/object merge rules or whether the UI shows per-key provenance (which level won). Treat the precise merge algorithm and provenance display as **not documented / unverified** — design zodal to be explicit where Sourcegraph is silent.

**KEEP:** the **JSON-Schema-validated, few-named-ordered-levels, surfaced-in-product** shape — this is almost exactly zodal-settings' target. Each scope = one editable partial layer; the product reads the merged effective value.
**AVOID:** leaving merge/provenance semantics implicit and under-documented. zodal must specify these precisely and *show* provenance.

---

## The two patch standards (dimension C, serialization)

| | **JSON Merge Patch (RFC 7386)** | **JSON Patch (RFC 6902)** |
|---|---|---|
| Shape | A partial JSON doc (looks like the data) | Ordered list of ops |
| Algorithm | Recursive deep-merge; non-objects replace [3] | Sequential `add/remove/replace/move/copy/test`; abort-on-fail [4] |
| Delete | `null` removes the key [3] | explicit `remove` op |
| Arrays | replaced wholesale (cannot partially edit) [3] | full index-level control |
| Reversible / auditable | no | yes (ordered log; `test` = optimistic concurrency) [4] |
| Best zodal use | **the layer/overlay shape** | **history / audit / undo** |

RFC 7386's core algorithm (verbatim pseudocode) [3]:

```
define MergePatch(Target, Patch):
  if Patch is an Object:
    if Target is not an Object: Target = {}
    for each Name/Value in Patch:
      if Value is null:
        if Name in Target: remove Name from Target
      else:
        Target[Name] = MergePatch(Target[Name], Value)
    return Target
  else:
    return Patch
```

This *is* the recommended default cascade step for zodal-settings.

---

## Synthesis — a precise, minimal merge/precedence model for zodal-settings

*(This section is design synthesis/opinion, grounded in the cited engines.)*

**1. Scopes are an ordered list.** Default `< preset < profile < workspace < policy` (policy = managed/admin, non-overridable). Precedence is positional — a property of the scope, not the value (Ansible's lesson [12]). Keep the list **short and named** (anti-Ansible).

**2. A layer is a partial map of `key → value`**, serialized as an **RFC 7386 Merge Patch** [3]. Settings keyed by dotted path; object values nest naturally.

**3. The default cascade step is RFC-7386 deep-merge** [3], independently validated by Helm [5]:
   - object vs object → **recurse per key**
   - scalar or array (in higher layer) → **replace** the lower value wholesale
   - `null` in a higher layer → **delete** the key
   - higher scope always wins on conflict

**4. Merge strategy is per-key overridable** (Kustomize's `patchStrategy` idea [11], borrowing the term from zodal's vocabulary): `replace` (default for scalars/arrays) | `deep-merge` (default for objects) | `append` (concatenate arrays) | `strategic` (merge array elements by a declared id key — the *escape hatch*, opt-in, schema-declared via `.meta()`). Default to `replace` when unspecified, matching Kubernetes' "no strategy → replace" rule [10] and Ansible's replace-by-default [12].

**5. Validate the effective value before apply** (Terraform's discipline [8]): cascade → validate merged result against the Zod schema **and** cross-field hard constraints → then live-apply or flag requires-restart.

**6. Effective value is always paired with provenance** — winning scope + the ordered list of shadowed layers. This is dimension G and the single biggest gap across *all* surveyed engines [12][6]; making it first-class is zodal's differentiator.

**7. History/undo uses RFC 6902** [4]: every applied layer change is recorded as a reversible JSON Patch op-list; `test` ops enable optimistic concurrency. Keep this *separate* from the Merge-Patch layer shape.

**Minimal contract:** `cascade(scopes: orderedLayers, strategies: perKeyStrategy): { value, provenance }`, where each step is RFC-7386 deep-merge unless a per-key strategy overrides it.

---

## References

1. [Declarative Management of Kubernetes Objects Using Kustomize — Kubernetes docs](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
2. [kustomize examples (inline patches, multiple objects) — kubernetes-sigs/kustomize](https://github.com/kubernetes-sigs/kustomize/blob/master/examples/inlinePatch.md)
3. [RFC 7386 — JSON Merge Patch (IETF)](https://datatracker.ietf.org/doc/html/rfc7386)
4. [RFC 6902 — JavaScript Object Notation (JSON) Patch (IETF)](https://datatracker.ietf.org/doc/html/rfc6902)
5. [Values Files — Helm docs](https://helm.sh/docs/chart_template_guide/values_files/)
6. [Settings — Sourcegraph docs](https://sourcegraph.com/docs/admin/config/settings)
7. [Settings cascade — Sourcegraph docs](https://sourcegraph.com/docs/admin/config/settings-cascade)
8. [Input variables (precedence + validation) — Terraform / HashiCorp Developer](https://developer.hashicorp.com/terraform/language/values/variables)
9. [Advanced Helm Techniques (coalescing / lists / null) — howardjohn's blog](https://blog.howardjohn.info/posts/advanced-helm/)
10. [Strategic Merge Patch — kubernetes/community (sig-api-machinery)](https://github.com/kubernetes/community/blob/main/contributors/devel/sig-api-machinery/strategic-merge-patch.md)
11. [Kubernetes Strategic Merge Patch — Brian Grant, ITNEXT](https://itnext.io/kubernetes-strategic-merge-patch-4bdd19b48789)
12. [Controlling how Ansible behaves: precedence rules — Ansible docs](https://docs.ansible.com/projects/ansible/latest/reference_appendices/general_precedence.html)
13. [Using variables — Ansible docs](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_variables.html)
