import { Session } from 'meteor/session';
import { ReactiveDict } from 'meteor/reactive-dict';
import { Router } from 'meteor/iron:router';
import { Template } from 'meteor/templating';
import { $ } from 'meteor/jquery';

import Categories from '/imports/api/categories/categories.js';
import Courses from '/imports/api/courses/courses.js';
import CourseTemplate from '/imports/ui/lib/course-template.js';
import FilterPreview from '/imports/ui/lib/filter-preview.js';
import ScssVars from '/imports/ui/lib/scss-vars.js';
import UrlTools from '/imports/utils/url-tools.js';

import '/imports/ui/components/courses/list/course-list.js';
import '/imports/ui/components/courses/edit/course-edit.js';
import '/imports/ui/components/courses/filter/course-filter.js';
import '/imports/ui/components/loading/loading.js';

import './find.html';

var hiddenFilters = ['needsRole', 'categories'];
var filters = hiddenFilters.concat(['state']);

Template.find.onCreated(function() {
	// Reflect filter selection in URI
	// This creates a browser history entry so it is not done on every filter
	// change. For example, when the search-field receives keydowns, the filter
	// is updated but the change is not reflected in the URI.
	this.updateUrl = () => {
		const filterParams = this.filter.toParams();
		delete filterParams.region; // HACK region is kept in the session (for bad reasons)
		delete filterParams.internal;
		const queryString = UrlTools.paramsToQueryString(filterParams);

		const options = {};

		if (queryString.length) {
			options.query = queryString;
		}

		RouterAutoscroll.cancelNext();

		const router = Router.current();
		Router.go(router.route.getName(), { _id: router.params._id }, options);

		return true;
	};


	this.updateCategorySearch = (categorySearch) => {
		this.state.set({ categorySearch });

		if (!categorySearch) {
			this.state.set('categorySearchResults', Categories);
			return;
		}

		const lowQuery = categorySearch.toLowerCase();
		const results = {};
		for (const mainCategory in Categories) {
			if (mf('category.' + mainCategory).toLowerCase().indexOf(lowQuery) >= 0) {
				results[mainCategory] = [];
			}
			for (let i = 0; i < Categories[mainCategory].length; i++) {
				const subCategory = Categories[mainCategory][i];
				if (mf('category.' + subCategory).toLowerCase().indexOf(lowQuery) >= 0) {
					if (results[mainCategory]) {
						results[mainCategory].push(subCategory);
					} else {
						results[subCategory] = [];
					}
				}
			}
		}
		this.state.set('categorySearchResults', results);
	};

	this.updateCategorySearchDebounced = _.debounce(this.updateCategorySearch, 200);

	this.state = new ReactiveDict();
	this.state.setDefault(
		{ limit: 5
		, hasMore: false
		, showingFilters: false
		, categorySearch: ''
		, categorySearchResults: Categories
		}
	);
	this.increaseBy = 5;

	const filter = Courses.Filtering();
	this.filter = filter;

	// Read URL state
	this.autorun(() => {
		const query = Template.currentData();
		filter
			.clear()
			.read(query)
			.done();
	});

	// When there are filters set, show the filtering pane
	this.autorun(() => {
		for (const name in filter.toParams()) {
			if (hiddenFilters.indexOf(name) > -1) {
				this.state.set('showingFilters', true);
			}
		}
	});

	this.dynamicallyLoadCourses = () => {
		if (!this.state.get('hasMore')) return;

		const courselist = this.$('.course-list');
		if (courselist.length) {
			const offsetBottom = courselist.offset().top + courselist.height();

			if ($(window).scrollTop() >= offsetBottom - $(window).height()) {
				this.state.set('limit', this.state.get('limit') + this.increaseBy);
			}
		}
	};

	// Update whenever filter changes
	this.autorun(() => {
		const filterQuery = filter.toQuery();
		const limit = this.state.get('limit');

		this.subscribe('Courses.findFilter', filterQuery, limit + 1, () => {
			const results = Courses.findFilter(filterQuery, limit + 1);
			this.state.set('hasMore', results.count() > limit);
			this.dynamicallyLoadCourses();
		});
	});
});

Template.find.onRendered(function() {
	$(window).scroll(() => { this.dynamicallyLoadCourses(); });
});

Template.find.events({
	'keyup .js-search-input': _.debounce(function(event, instance) {
		instance.filter.add('search', $('.js-search-input').val()).done();
		// we don't updateURL() here, only after the field loses focus
	}, 200),


	// Update the URI when the search-field was changed an loses focus
	'change .js-search-field'(event, instance) {
		instance.updateUrl();
	},

	'click .js-find-btn'(event, instance) {
		event.preventDefault();

		instance.filter.add('search', $('.js-search-input').val()).done();
		instance.updateUrl();
	},

	'mouseover/mouseout .js-category-label'(event, instance) {
		FilterPreview({
			property: 'category',
			id: this,
			activate: event.type === 'mouseover',
			delayed: true,
			instance
		});
	},

	'mouseover/mouseout .js-group-label'(event, instance) {
		FilterPreview({
			property: 'group',
			id: this,
			activate: event.type === 'mouseover',
			delayed: true,
			instance
		});
	},

	'click .js-category-label'(event, instance) {
		instance.filter.add('categories', ""+this).done();
		instance.$('.js-search-categories').val('');
		instance.updateCategorySearch('');
		instance.updateUrl();
		window.scrollTo(0, 0);
	},

	'click .js-group-label'(event, instance) {
		window.scrollTo(0, 0);
	},

	'click .js-toggle-filter'(event, instance) {
		const showingFilters = !instance.state.get('showingFilters');
		instance.state.set({ showingFilters });

		if (!showingFilters) {
			for (const i in filters) instance.filter.disable(filters[i]);
			instance.filter.done();
			instance.updateUrl();
		}
	},

	'click .js-all-regions-btn'(event, instance){
		Session.set('region', 'all');
	}
});

Template.find.helpers({
	search() {
		return Template.instance().filter.get('search');
	},

	newCourse() {
		const instance = Template.instance();
		const course = CourseTemplate();
		course.name = instance.filter.get('search');
		const groupId = instance.filter.get('group');
		if (groupId) {
			course.group = groupId;
		}
		return course;
	},

	hasResults() {
		const filterQuery = Template.instance().filter.toQuery();
		const results = Courses.findFilter(filterQuery, 1);

		return results.count() > 0;
	},

	results() {
		const instance = Template.instance();
		const filterQuery = instance.filter.toQuery();

		return Courses.findFilter(filterQuery, instance.state.get('limit'));
	},

	filteredRegion() {
		return !!Template.instance().filter.get('region');
	},

	activeFilters() {
		const activeFilters = Template.instance().filter;
		return hiddenFilters.some((filter) => !!activeFilters.get(filter));
	},

	searchIsLimited() {
		const activeFilters = Template.instance().filter;
		const relevantFilters = hiddenFilters.slice(); // clone
		relevantFilters.push('region');
		return relevantFilters.some((filter) => !!activeFilters.get(filter));
	},

	isMobile() {
		return Session.get('viewportWidth') <= ScssVars.screenXS;
	}
});
