build:
	docker build . -t mlynar-operator-wrapper:latest

go: build push

push:
	docker tag mlynar-operator-wrapper ffluffyhedgehog/mlynar-operator-wrapper:${MLYNAR_VERSION}
	docker push ffluffyhedgehog/mlynar-operator-wrapper:${MLYNAR_VERSION}
	docker tag mlynar-operator-wrapper ffluffyhedgehog/mlynar-operator-wrapper:latest
	docker push ffluffyhedgehog/mlynar-operator-wrapper:latest
