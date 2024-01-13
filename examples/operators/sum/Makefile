build:
	docker build . -t sum:latest


go: build push apply

apply:
	kubectl apply -f ./operator.yaml

push:
	docker tag sum ffluffyhedgehog/mlynar-example-sum:latest
	docker push ffluffyhedgehog/mlynar-example-sum:latest
