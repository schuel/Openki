import { DDP } from 'meteor/ddp-client';
import { Meteor } from 'meteor/meteor';
import { Promise } from 'meteor/promise';

/**
 * Returns a promise which resolves when all subscriptions are ready.
 */
export const subscriptionsReady = () => new Promise(resolve => {
	const poll = Meteor.setInterval(() => {
		if (DDP._allSubscriptionsReady()) {
			Meteor.clearInterval(poll);
			resolve();
		}
	}, 200);
});

/**
 * Returns a promise which resolves if test returns anything but undefined.
 *
 * The test function is run in response to dom mutation events. See:
 * https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
 */
export const elementsReady = (test) => new Promise(resolve  => {
    let result = test([])
    if (result !== undefined) {
        resolve(result);
    }
    else {
        const observer = new MutationObserver(function(mutations) {
            let result = test(mutations);
            if (result !== undefined) {
                observer.disconnect();
                resolve();
            }
        })

        observer.observe(document.body, {
            childList: true, subtree: true, attributes: false, characterData: false
        })
    }
});
