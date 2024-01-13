build:
	docker build . -t fail:latest


go: build push apply

apply:
	kubectl apply -f ./operator.yaml

push:
	docker tag fail ffluffyhedgehog/mlynar-example-fail:latest
	docker push ffluffyhedgehog/mlynar-example-fail:latest
