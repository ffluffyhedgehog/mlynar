build-docker:
	docker buildx build . -t mlynar:latest --build-arg MLYNAR_VERSION=${MLYNAR_VERSION}
	docker buildx build ./operator-wrapper -t ffluffyhedgehog/mlynar-operator-wrapper:${MLYNAR_VERSION}

start:
	kubectl apply -f ./examples/k8s/deployment.yaml
stop:
	kubectl delete -f ./examples/k8s/deployment.yaml

redeploy: build-docker push stop start

deploy: build-docker push start

restart: stop start

push:
	docker tag mlynar ffluffyhedgehog/mlynar:${MLYNAR_VERSION}
	docker push ffluffyhedgehog/mlynar:${MLYNAR_VERSION}
	docker tag mlynar ffluffyhedgehog/mlynar:latest
	docker push ffluffyhedgehog/mlynar:latest
	docker tag mlynar-operator-wrapper ffluffyhedgehog/mlynar-operator-wrapper:${MLYNAR_VERSION}
	docker push ffluffyhedgehog/mlynar-operator-wrapper:${MLYNAR_VERSION}
	docker tag mlynar-operator-wrapper ffluffyhedgehog/mlynar-operator-wrapper:latest
	docker push ffluffyhedgehog/mlynar-operator-wrapper:latest
