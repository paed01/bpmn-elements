Changelog
=========

# 0.5.0

- allow a waiting UserTask to trigger an execution error
- catch signal fired before event execution

# 0.4.0

## Breaking
- Catching ErrorEventDefinition now catches BpmnErrors. Support for catching by error code and anonymous errors is still supported
- Event with throwing ErrorEventDefinition now throws non-fatal BpmnErrors

## Additions
- Expose element name on Api
- Extension function `deactivate` is now actually called, called on leave and stop
