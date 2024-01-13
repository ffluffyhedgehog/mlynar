build:
	docker build . -t length:latest


go: build push apply

apply:
	kubectl apply -f ./operator.yaml

push:
	docker tag length ffluffyhedgehog/mlynar-example-length:latest
	docker push ffluffyhedgehog/mlynar-example-length:latest
