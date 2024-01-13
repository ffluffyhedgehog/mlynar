build:
	docker build . -t average:latest

go: build push apply

apply:
	kubectl apply -f ./operator.yaml

push:
	docker tag average ffluffyhedgehog/mlynar-example-average:latest
	docker push ffluffyhedgehog/mlynar-example-average:latest
