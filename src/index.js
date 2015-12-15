"use strict";

const isPromise = maybePromise => maybePromise && typeof maybePromise.then === 'function';

const isAsyncAction = maybeAsync => maybeAsync && maybeAsync.types instanceof Array;

const isDispatchError = maybeDispatchError => maybeDispatchError && maybeDispatchError.__isDispatchError === true;

const dispatchedPromise = (promise, types, dispatch, retryAction) => {

    const [START, SUCCESS, FAIL] = types;

    dispatch({
        type: START,
        meta: {
            async: true,
            retryAction
        }
    });

    return promise.then(
        result => {
            try {
                dispatch({
                    type: SUCCESS,
                    payload: result,
                    meta: {
                        resolves: START
                    }
                });
            } catch(dispatchError) {
                dispatchError.__isDispatchError = true;
                throw dispatchError;
            }
            return result;
        },
        error => {
            try {
                dispatch({
                    type: FAIL,
                    payload: error,
                    error: true,
                    meta: {
                        resolves: START,
                        retryAction
                    }
                });
            } catch(dispatchError) {
                dispatchError.__isDispatchError = true;
                throw dispatchError;
            }
            throw error;
        }
    );

};


const promisifiedDispatchedAsyncAction = (asyncAction, dispatch, retryAction) => {

    const payload = typeof asyncAction.payload === "function" ? asyncAction.payload() : asyncAction.payload;

    if (isPromise(payload)) {

        return dispatchedPromise(payload, asyncAction.types, dispatch, retryAction)

    } else if (isAsyncAction(payload)) {

        return dispatchedPromise(
            promisifiedDispatchedAsyncAction(payload, dispatch, retryAction),
            payload.types,
            dispatch
        );

    } else if (payload instanceof Array) {

        return dispatchedPromise(
            payload.reduce(
                (acc, nextPart) => acc.then(
                    previousResult => {
                        nextPart = typeof nextPart === "function" ? nextPart(previousResult) : nextPart;
                        if (isPromise(nextPart)) {
                            return nextPart;
                        } else if (isAsyncAction(nextPart)) {
                            return promisifiedDispatchedAsyncAction(nextPart, dispatch, null)
                        } else {
                            return nextPart;
                        }
                    }
                ),
                Promise.resolve()
            ),
            asyncAction.types,
            dispatch,
            retryAction
        );

    } else {

        return(Promise.resolve(payload));

    }

};

export default ({ dispatch }) => next => action => {

    if (isAsyncAction(action)) {

        promisifiedDispatchedAsyncAction(action, dispatch, action)
            .catch(error => {
                if (isDispatchError(error)) {
                    throw error;
                }
            });

    } else {

        next(action);

    }

};