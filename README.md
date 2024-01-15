# Mlynar

Mlynar (ukr. млинар, miller) is a Kubernetes-based lower-maintenance workflowless workflow runner,
based on data kinds and operators.

## Table of contents

1. [Conceptual overview](#conceptual-overview)
2. [Declaring Operators and DataKinds](#declaring-operators-and-datakinds)
3. [Fun things you might enjoy doing with Mlynar](#fun-things-you-might-enjoy-doing-with-mlynar)
4. [Deploying Mlynar](#deploying-mlynar)
5. [Executing a Run](#executing-a-run)
6. [Mlynar Jobs and PVCs](#mlynar-jobs-and-pvcs)
7. [Debugging problematic Steps](#debugging-problematic-steps)
8. [IMPORTANT Security concerns](#security-concerns)
9. [Contribution and communication](#contribution-and-communication)

## Conceptual overview

Instead of composing and maintaining a DAG like you would in common
workflow systems, you declare a set of DataKinds -- semantic string labels for data.
To process DataUnits -- individual files marked with a DataKind -- you declare Operators,
which can have one or multiple required inputs of some DataKind. A given operator
has a set of possible output kinds. When running, the operator might output
one or more DataUnit of one or more declared possible outputs.

To process some data you have -- you create a Run and attach one or more DataUnits
to it, and start it. On each turn, Mlynar's solver will look at the available
Operators and DataUnits, and automatically calculate all the possible input sets
for all operators that can be run with the available data, and execute those, putting
the outputs of executed Steps -- executions of an Operator with a unique set of inputs --
back into the Data Pool for it to be then processed in the next turns of calculations.

Mlynar's way of processing data is dynamic and designed for handling non-deterministic
processes. Your operator might output one Unit of some Kind, might output a lot, might output nothing,
all depending on input data, some requests your Operator does to external system,
randomness, or the weather on Mars. Mlynar will handle it for you.

## Fun things you might enjoy doing with Mlynar

A tool used in 10 pipelines slightly changes their API and now you need
to update all of them? Have no worries because with Mlynar you don't have to declare
any pipelines! Which means you don't need to maintain them. Just update
the operator declaration and you're done!

Some of the tools are behaving weirdly and you need to dig into the intermediary
data to figure it out? Mlynar serves you every piece of data, in or out.
Come and get it!

A step in the pipeline needs to make a decision? Declare as many possible
outputs as you like, and let the operator select which one to output!

You need to slice a 3d thing (like a CT scan) into 2d slices
which will then be processed by other operators, but you don't know how many
of them will be there? Just throw them all into the output, as many as there are,
and Mlynar will figure it out!

You might even need to run each of those 2d slices along with a single other
piece of data, and Mlynar will do it for you!

You have a set of operators working with CSV but now you're migrating to HDF5?
Just make two adapters (CSV => HDF5 and HDF5 => CSV) and now you won't need
to rewrite everything at once to accept the new format! Mlynar will
convert HDF5 to CSV for the new Operators if you input HDF5, and will convert
CSV to HDF5 for the new ones!

## Declaring Operators and DataKinds

DataKinds and Operators are declared with [Kubernetes Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
which you can install into your cluster from [crd.yaml](crd.yaml).

Let's look at an example:

```yaml
apiVersion: mlynar.dev/v1alpha1
kind: DataKind
metadata:
  name: number-array-json
spec:
  displayName: 'Number Array JSON'
```

Seems simple enough? Because it really is. A Data Kind is just a string label for your data.
This one would describe a simple JSON file containing an array of numbers, like `[1, 2, 3, 4, 5]`.

A simple Operator using this Data Kind would look like this:

```yaml
apiVersion: mlynar.dev/v1alpha1
kind: Operator
metadata:
  name: sum
  namespace: default
spec:
  image: "ffluffyhedgehog/mlynar-example-sum:latest"
  possibleOutputKinds:
    - "number-array-sum-json"
  inputs:
    - fileLocationEnv: "INPUT_ARRAY"
      dataKind: "number-array-json"
  configurableEnv:
    - name: "MULTIPLY_BY"
      defaultValue: "1"
  constantEnv:
    - name: "SOME_ENV_VAR"
      value: 'SOME_VALUE'

```
This operator asks for a `number-array-json` to be provided, and the path to file of this DataKind
to be written into `INPUT_ARRAY` environmental variable. It also declares one possible output type --
`number-array-sum-json`, and that one might pass a parameter to it during execution -- `MULTIPLY_BY`, which
will as well be provided as an environmental variable.
For some Operators, one might need to also prime them with some constant environental
variables which are not parametrizable per Run. Sourcing environmental variables
from Kubernetes secrets or other ways is currently not available, yet support for it
might be added in the future.

The operator also contains an image, which will be executed as a container inside a
Kubernetes [Job](https://kubernetes.io/docs/concepts/workloads/controllers/job/),
and one might also provide `args` in the Operator's spec, which will be passed to container's ENTRYPOINT

The directory for the Operator to put outputs to is provided in `MLYNAR_OUTPUT_DIR` environmental variable.

The full implementation for this example operator is located [here](examples/operators/sum).

## Deploying Mlynar

For now, there is no Helm chart for Mlynar,so an example deployment with
the rest of configuration is provided [here](examples/k8s).

## Executing a Run

This section assumes you used the example deployment way, and you now have a `mlynar-service`
with Mlynar listening at port `3000`.

Once your Operators and DataKinds have been declared, it is time to actually
execute some Runs!

### Creating a run

An empty **POST** at `http://mlynar-service:3000/api/run` would create you an empty Run,
which looks like this: 
```json
{
    "id": "9be95b41-8309-4c54-9d4c-bb8cc7bb7c46",
    "steps": [],
    "status": "created",
    "dataPool": [],
    "paramPool": {}
}
```
But that looks kinda empty, doesn't it? Let's throw some data in. You can try the
same DataKinds and Operators by referring to [the examples](examples/operators).

### Adding data to a run

We can hit **POST** `http://mlynar-service:3000/api/run/{{runId}}/upload/{{dataKind}}`
with a multipart/form-data body containing a file at any key of the body. We'll use
the run we just created and `number-array-json` as our dataKind.

In return, we will get the DataUnit created with this file.
```json
{
    "id": "bbb70192-388a-4e4d-91f9-29ca1eddb127",
    "dataKind": "number-array-json",
    "ancestors": [],
    "url": "http://mlynar-service:3000/static/9be95b41-8309-4c54-9d4c-bb8cc7bb7c46/data/bbb70192-388a-4e4d-91f9-29ca1eddb127"
}
```

As you can see, there's a URL from which we can download this file if we so desire, an ID, the
dataKind we provided and an ancestor list, which will be important later.

### Getting the state of the run

If we now **GET** `http://mlynar-service:3000/api/run/{{runId}}`, we'll see that this DataUnit
entered the run's dataPool.

### Getting run options

With data uploaded, we're almost ready to run. But before doing so, we might want
to check whether any of the Operators that might be executed have any parameters
that we might want to configure. To do so, we **GET** `http://mlynar-service:3000/api/run/{{runId}}/params`
At this request, Mlynar goes through the data you added to the pool,
the operators available in the system and their possible outputs, and constructs
a comprehensive list of all the operators that might be executed during this run
and their configurable parameters.

In our example, the result looks like this:
```json
{
    "length": [
        {
            "defaultValue": "1",
            "name": "MULTIPLY_BY"
        }
    ],
    "sum": [
        {
            "defaultValue": "1",
            "name": "MULTIPLY_BY"
        }
    ],
    "average": [
        {
            "defaultValue": "1",
            "name": "MULTIPLY_BY"
        }
    ]
}
```

### Running the run

To run the Run, we need to compose a JSON body containing the parameters we configured,
in the same data structure that we received in the previous step of our journey, with chosen values
attached to each of the paramameters. Let's make it look like this:
```json
{
    "length": [
        {
            "defaultValue": "1",
            "value": "3",
            "name": "MULTIPLY_BY"
        }
    ],
    "sum": [
        {
            "defaultValue": "1",
            "value": "5",
            "name": "MULTIPLY_BY"
        }
    ],
    "average": [
        {
            "defaultValue": "1",
            "value": "2",
            "name": "MULTIPLY_BY"
        }
    ]
}
```

Once done, we send it to **POST** `http://mlynar-service:3000/api/run/{{runId}}/run`. In return, 
we receive the body of the Run, with our `dataPool` filled with our starting data, as we
saw before, and with the body we just sent being the `paramPool`, and the status set as `running`.

We can periodically check up on the run using the same GET from [Getting the state of the run](#getting-the-state-of-the-run),
and see new Steps being added and new items arriving into the `dataPool`.

Once the state of the run is `complete` we can take a deeper look inside:
<details>
  <summary>Run's body after the execution is complete</summary>

```json
{
    "id": "9be95b41-8309-4c54-9d4c-bb8cc7bb7c46",
    "steps": [
        {
            "id": "183514fd-8424-4111-a527-885cb96838d7",
            "jobName": "mlynar-job-183514fd-8424-4111-a527-885cb96838d7",
            "inputDataUnits": {
                "INPUT_ARRAY": "bbb70192-388a-4e4d-91f9-29ca1eddb127"
            },
            "outputDataUnits": [
                "b44140d4-03a4-421d-90a7-ccc3572494ad"
            ],
            "pvcName": "mlynar-job-183514fd-8424-4111-a527-885cb96838d7-pvc",
            "operator": "length",
            "status": "success"
        },
        {
            "id": "6a424797-d357-4242-8616-a2883b32ef4c",
            "jobName": "mlynar-job-6a424797-d357-4242-8616-a2883b32ef4c",
            "inputDataUnits": {
                "INPUT_ARRAY": "bbb70192-388a-4e4d-91f9-29ca1eddb127"
            },
            "outputDataUnits": [
                "27a9e335-3a9d-4d4b-923d-7f92f380c4dc"
            ],
            "pvcName": "mlynar-job-6a424797-d357-4242-8616-a2883b32ef4c-pvc",
            "operator": "sum",
            "status": "success"
        },
        {
            "id": "a3a55190-0452-4457-b34a-d3474ad639f4",
            "jobName": "mlynar-job-a3a55190-0452-4457-b34a-d3474ad639f4",
            "inputDataUnits": {
                "INPUT_SUM": "27a9e335-3a9d-4d4b-923d-7f92f380c4dc",
                "INPUT_LENGTH": "b44140d4-03a4-421d-90a7-ccc3572494ad"
            },
            "outputDataUnits": [
                "1d9e8901-9c2c-4594-ab15-c87c20f62066"
            ],
            "pvcName": "mlynar-job-a3a55190-0452-4457-b34a-d3474ad639f4-pvc",
            "operator": "average",
            "status": "success"
        }
    ],
    "status": "complete",
    "dataPool": [
        {
            "id": "bbb70192-388a-4e4d-91f9-29ca1eddb127",
            "dataKind": "number-array-json",
            "ancestors": [],
            "url": "http://mlynar-service:3000/static/9be95b41-8309-4c54-9d4c-bb8cc7bb7c46/data/bbb70192-388a-4e4d-91f9-29ca1eddb127"
        },
        {
            "id": "27a9e335-3a9d-4d4b-923d-7f92f380c4dc",
            "dataKind": "number-array-sum-json",
            "ancestors": [
                "sum"
            ],
            "url": "http://mlynar-service:3000/static/9be95b41-8309-4c54-9d4c-bb8cc7bb7c46/data/27a9e335-3a9d-4d4b-923d-7f92f380c4dc"
        },
        {
            "id": "b44140d4-03a4-421d-90a7-ccc3572494ad",
            "dataKind": "number-array-length-json",
            "ancestors": [
                "length"
            ],
            "url": "http://mlynar-service:3000/static/9be95b41-8309-4c54-9d4c-bb8cc7bb7c46/data/b44140d4-03a4-421d-90a7-ccc3572494ad"
        },
        {
            "id": "1d9e8901-9c2c-4594-ab15-c87c20f62066",
            "dataKind": "number-array-average-json",
            "ancestors": [
                "sum",
                "length",
                "average"
            ],
            "url": "http://mlynar-service:3000/static/9be95b41-8309-4c54-9d4c-bb8cc7bb7c46/data/1d9e8901-9c2c-4594-ab15-c87c20f62066"
        }
    ],
    "paramPool": {
        "length": [
            {
                "defaultValue": "1",
                "value": "3",
                "name": "MULTIPLY_BY"
            }
        ],
        "sum": [
            {
                "defaultValue": "1",
                "value": "5",
                "name": "MULTIPLY_BY"
            }
        ],
        "average": [
            {
                "defaultValue": "1",
                "value": "2",
                "name": "MULTIPLY_BY"
            }
        ]
    }
}
```

</details>
And, as we can see, there are three new Data Units -- the outputs of length and sum,
and the output of average, as indicated by outputDataUnits in the steps,
and ancestors in the data units themselves. Mlynar keeps track of that ancestry data
to avoid cyclic calculations.

If we do a GET at the url, we can see the result of the average's computations:
```json
{"average":10}
```

While it is of course not an _actual_ average of `[1, 2, 3, 4, 5]` we gave it, we actually multiplied
the length by three, the sum by 5, and the average computed with those
two parameters by 2. So, 1+2+3+4+5=15, 15*5=75, 5*3=15, 75/15=5, 5*2=10.
Yes, it's silly, but it's just a showoff example, hey!

Anyway, now you can compute your own Mlynar Run!

### Deleting a run

Just send **DELETE** `http://mlynar-service:3000/api/run/{{runId}}`, and Mlynar
will purge the run, along with the associated Data Units stored in Mlynar.

### Terminating a run

If for some reason you might want to stop a given run, you can
**POST** `http://mlynar-service:3000/api/run/{{runId}}/terminate`.
Mlynar will wait until running Steps finish, but will not compute the next
turn of Steps.

## Mlynar Jobs and PVCs

Per Step, Mlynar creates a PVC and a Job running the Operator. A Mlynar Job
consists of two init containers, and one final container.

The first and the last container are ran from Mlynar's Operator Wrapper image.
This image contains the scripts that download Operator's input data into
designated places in the Step's PVC, and upload Operator's outputs back into Mlynar.

The second init container is spawned with the image provided in Operator's configuration,
as well as the environments regarding the inputs, envs and output directory.

Unless an Operator fails, Mlynar will clean up the Job and the PVC after it's finished.

## Debugging problematic Steps

If a Step's Operator fails, Mlynar leaves the Job in the
cluster for you to inspect the logs. You can find failed Operators by checking
that Operator's status is 'failure', along with the names for the Job and the PVC.

When you are done checking the logs, you can delete the run and Mlynar will
clean up the Job and the PVC for you.

In future, Mlynar will collect the logs for you and delete the Job and the PVC,
instead of leaving them for manual inspection.

## IMPORTANT Security concerns

**Do not, ever, expose Mlynar to the world outside your cluster.** This code has no authentication
and provides direct access to your cluster without any authentication or encryption. This code
has not been subjected to security audits. **Mlynar is designed and intended to
only be run as a microservice for other services within your cluster.**

Another thing to consider is to avoid using mlynar:latest at all cost.
This thing is real early in development and shit might change,
and you _really_ don't want it to change on you mid-flight.

## Development, contribution and communication

I developed it relying on a cloud cluster and an image repository,
so I haven't figured out local development just yet.

Contributions... You really want to? I'm stoked you exist. Ping me and I'll
get around the local tooling faster so that it's easier for you to contribute!

Any other matter about Mlynar -- feel free to open a [discussion](https://github.com/ffluffyhedgehog/mlynar/discussions),
an [issue](https://github.com/ffluffyhedgehog/mlynar/issues/new), or just drop me an email
to fedir at mlynar.dev if you wish some privacy or something.