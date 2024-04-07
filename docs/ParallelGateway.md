# ParallelGateway

Join or fork gateway.

## Join Edge case

There is an edge case where the behaviour of a joining parallel gateway is not clear to yours truly. Suggestions on how to tackle this are appreciated.

### Case

If inbound sequence flows are touched more than once before the last join inbound flow have completed: what is the expected joining gateway behaviour?

### Proposed behaviours

1. Ignore inbound flows that are touched more than once before all have been touched
2. Collect all inbound flow actions and complete join as soon as the last inbound flow is touched

This project do the latter.

Both behaviour comes with the same caveat.

![Edge Case](https://raw.github.com/paed01/bpmn-elements/master/docs/parallel-join-edgecase.png)

The success of the above example is depending on how the sequence flows are ordered in the source (XML). If the flow `default` comes before `take` or `discard` the process will stall. The default flow will publish a discard initializing the join gateway. As soon as either `take` or `discard` is touched the join gateway will consider the join fulfilled and continue. Thus, the second `task` outbound flow will initiate a new join. But in vain since no more flow actions will come from `decision` gateway. The process has stalled.

But, if the `default` is placed at after `take` or `discard` in the source, both of them will manage to touch the `toJoin` flow before the `default` flow is touched.
