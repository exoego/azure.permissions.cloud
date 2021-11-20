// azure.permissions.cloud Core Functionality

var custom_policy_timer;


var arn_template_state = "Processed";
function swapARN() {
    $('#arn-template-state').html(arn_template_state);
    if (arn_template_state == "Processed") {
        $('.original-arn-template').attr('style', '');
        $('.processed-arn-template').attr('style', 'display: none;');
        arn_template_state = "Original";
    } else {
        $('.original-arn-template').attr('style', 'display: none;');
        $('.processed-arn-template').attr('style', '');
        arn_template_state = "Processed";
    }
}

function readable_date(str) {
    if (!str) {
        return "-";
    }

    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
    ]
    let date = new Date(str);

    return '<span data-toggle="tooltip" data-placement="top" title="' + str + '">' + date.getDate() + ' ' + months[date.getMonth()] + ', ' + date.getFullYear() + '</span>';
}

function addcomma(val) {
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
    console.log('Query variable %s not found', variable);
}

function processEffective(permissions, tableid, services) {
    var tbody = $(tableid + " tbody");
    var permitted_actions = [];
    var permitted_data_actions = [];
    var table_content = '';

    for (let permission of permissions) {
        for (let action of permission['actions']) {
            matchexpression = "^" + action.replaceAll(/\./g, "\\.").replaceAll(/\*/g, ".*").replaceAll(/\?/g, ".{1}") + "$";
            for (let service of services) {
                for (let operation of service['operations']) {
                    var re = new RegExp(matchexpression.toLowerCase());
                    console.log(matchexpression);
                    console.log(re);
                    console.log(operation['name'].toLowerCase());
                    console.log("---");
                    if (!operation['isDataAction'] && operation['name'].toLowerCase().match(re)) {
                        permitted_actions.push({
                            'name': operation['name'],
                            'based_on': action,
                            'origin': operation['origin']
                        });
                    }
                }
            }
        }

        for (let action of permission['dataActions']) {
            matchexpression = "^" + action.replaceAll(/\./g, "\\.").replaceAll(/\*/g, ".*").replaceAll(/\?/g, ".{1}") + "$";
            for (let service of services) {
                for (let operation of service['operations']) {
                    var re = new RegExp(matchexpression.toLowerCase());
                    if (operation['isDataAction'] && operation['name'].toLowerCase().match(re)) {
                        permitted_data_actions.push({
                            'name': operation['name'],
                            'based_on': action,
                            'origin': operation['origin']
                        });
                    }
                }
            }
        }

        for (let action of permission['notActions']) {
            matchexpression = "^" + action.replaceAll(/\./g, "\\.").replaceAll(/\*/g, ".*").replaceAll(/\?/g, ".{1}") + "$";
            for (let service of services) {
                for (let operation of service['operations']) {
                    var re = new RegExp(matchexpression.toLowerCase());
                    if (!operation['isDataAction'] && operation['name'].toLowerCase().match(re)) {
                        permitted_actions = permitted_actions.filter(x => x['name'].toLowerCase() != operation['name'].toLowerCase());
                    }
                }
            }
        }

        for (let action of permission['notDataActions']) {
            matchexpression = "^" + action.replaceAll(/\./g, "\\.").replaceAll(/\*/g, ".*").replaceAll(/\?/g, ".{1}") + "$";
            for (let service of services) {
                for (let operation of service['operations']) {
                    var re = new RegExp(matchexpression.toLowerCase());
                    if (operation['isDataAction'] && operation['name'].toLowerCase().match(re)) {
                        permitted_data_actions = permitted_data_actions.filter(x => x['name'].toLowerCase() != operation['name'].toLowerCase());
                    }
                }
            }
        }
    }

    for (let action of permitted_actions) {
        var access_class = "tx-normal";
        var action_name_parts = action['name'].split("/");

        let origins = [];
        if (action['origin']) {
            origins = action['origin'].split(",");
            for (let i = 0; i < origins.length; i++) {
                origins[i] = origins[i][0].toUpperCase() + origins[i].substr(1);
            }
        }

        table_content += '<tr>\
            <td class="tx-medium"><span class="tx-color-03">' + action_name_parts.shift() + '/</span>' + action_name_parts.join("/") + '</td>\
            <td class="tx-medium">' + action['based_on'] + '</td>\
            <td class="tx-medium">' + origins.join(", ") + '</td>\
        </tr>';
    }

    for (let action of permitted_data_actions) {
        var access_class = "tx-normal";
        var action_name_parts = action['name'].split("/");

        let origins = [];
        if (action['origin']) {
            origins = action['origin'].split(",");
            for (let i = 0; i < origins.length; i++) {
                origins[i] = origins[i][0].toUpperCase() + origins[i].substr(1);
            }
        }

        table_content += '<tr>\
            <td class="tx-medium"><span class="tx-color-03">' + action_name_parts.shift() + '/</span>' + action_name_parts.join("/") + ' <span class="badge badge-primary">data action</span></td>\
            <td class="tx-medium">' + action['based_on'] + '</td>\
            <td class="tx-medium">' + origins.join(", ") + '</td>\
        </tr>';
    }

    tbody.html(table_content);
}

async function processReferencePage() {
    let services_data = await fetch('https://raw.githubusercontent.com/iann0036/iam-dataset/main/azure/provider-operations.json');
    let services = await services_data.json();
    let service = null;

    $('#actions-table tbody').html('');

    services.sort((a, b) => {
        if (!a['displayName'] || a['displayName'] == "") {
            a['displayName'] = a['name'];
        }
        if (!b['displayName'] || b['displayName'] == "") {
            b['displayName'] = b['name'];
        }
        if (a['displayName'].toLowerCase() < b['displayName'].toLowerCase()) {
            return -1;
        }
        return 1;
    });

    if ($('#reference-list').html() == "") {
        for (let service_def of services) {
            if (window.location.pathname == "/iam/" + service_def['name']) {
                service = service_def;

                $('#reference-list').append('<li class="nav-item active"><a href="/iam/' + service_def['name'] + '" class="nav-link"><span>' + service_def['displayName'] + '</span></a></li>');
            } else if (window.location.pathname == "/api/" + service_def['name']) {
                service = service_def;

                $('#reference-list').append('<li class="nav-item active"><a href="/api/' + service_def['name'] + '" class="nav-link"><span>' + service_def['displayName'] + '</span></a></li>');
            } else if (window.location.pathname.startsWith("/api/")) {
                $('#reference-list').append('<li class="nav-item"><a href="/api/' + service_def['name'] + '" class="nav-link"><span>' + service_def['displayName'] + '</span></a></li>');
            } else {
                $('#reference-list').append('<li class="nav-item"><a href="/iam/' + service_def['name'] + '" class="nav-link"><span>' + service_def['displayName'] + '</span></a></li>');
            }
        }
    }

    // Search
    $('#search-nav').on('click', function (e) {
        e.preventDefault();
        $('.navbar-search').addClass('visible');
        $('.backdrop').addClass('show');
        setTimeout(() => {
            $('.navbar-search-header > input').focus();
        }, 100);
    });

    /*
    $('.navbar-search-header > input').on('input', function(e){
        let searchterm = $('.navbar-search-header > input').val().toLowerCase();

        // IAM
        let html = '';
        let results = [];
        for (let service of iam_def) {
            for (let privilege of service['privileges']) {
                let fullpriv = service['prefix'] + ":" + privilege['privilege'];
                if (service['prefix'].toLowerCase().startsWith(searchterm) || privilege['privilege'].toLowerCase().startsWith(searchterm) || fullpriv.toLowerCase().startsWith(searchterm)) {
                    results.push(fullpriv);
                }
                if (results.length >= 10) break;
            }
            if (results.length >= 10) break;
        }
        for (let i=0; i<results.length && i<10; i++) {
            html += `<li style=\"margin-left: 5px; margin-top: 5px;\"><a href=\"/iam/${results[i].split(":")[0]}#${results[i].replace(":", "-")}\">${results[i]}</a></li>`;
        };
        $('#search-iam-list').html(html);

        // API
        html = '';
        results = [];
        for (let iam_mapping_name of Object.keys(sdk_map['sdk_method_iam_mappings']).sort()) {
            let split_name = iam_mapping_name.split(".");
            if (split_name[0].toLowerCase().startsWith(searchterm) || split_name[1].toLowerCase().startsWith(searchterm) || iam_mapping_name.toLowerCase().startsWith(searchterm)) {
                results.push(iam_mapping_name);
            }
            if (results.length >= 10) break;
        }
        for (let i=0; i<results.length && i<10; i++) {
            html += `<li style=\"margin-left: 5px; margin-top: 5px;\"><a href=\"/api/${sdk_map['sdk_method_iam_mappings'][results[i]][0]['action'].split(":")[0]}#${results[i].replace(".", "_")}\">${results[i]}</a></li>`;
        };
        $('#search-api-list').html(html);

        // Managed Policies
        html = '';
        results = [];
        for (let builtinrole of builtinroles['policies']) {
            if (builtinrole['name'].toLowerCase().includes(searchterm)) {
                results.push(builtinrole['name']);
            }
            if (results.length >= 10) break;
        }
        for (let i=0; i<results.length && i<10; i++) {
            html += `<li style=\"margin-left: 5px; margin-top: 5px;\"><a href=\"/builtinroles/${results[i]}\">${results[i]}</a></li>`;
        };
        $('#search-builtinroles-list').html(html);
    });

    // omnibox search
    if (window.location.search.includes('s=')) {
        $('.navbar-search').addClass('visible');
        $('.backdrop').addClass('show');
        setTimeout(() => {
            $('.navbar-search-header > input').focus();
            $('.navbar-search-header > input').val(getQueryVariable('s'));
            $('.navbar-search-header > input').trigger('input');
        }, 100);
    }
    */

    // resource type modal
    /*
    $('#resourceTypeModal').on('show.bs.modal', function (e) {
        let offset = 1;
        let rtdstart = "{";
        let rtdend = "\n}";        
        let tokens = $(e.relatedTarget).html().split(/(\[\]|\.)/g);
        for (let token of tokens) {
            if (token == "[]") {
                rtdstart += "[\n" + "    ".repeat(offset + 1);
                rtdend = "\n" + "    ".repeat(offset) + "]" + rtdend;
                offset += 1;
            } else if (token == ".") {
                rtdstart += "{" + "    ".repeat(offset + 1);
                rtdend = "\n" + "    ".repeat(offset) + "}" + rtdend;
                offset += 1;
            } else if (token == "") {
                // nothing
            } else {
                rtdstart += "\n" + "    ".repeat(offset) + "\"" + token + "\": ";
            }
        }
        rtdstart += "\"VALUE\",\n" + "    ".repeat(offset) + "...";
        $('#resourceTypeDisplay').html(rtdstart + rtdend);
    });
    */

    //
    $('#body-dashboard').attr('style', 'display: none;');
    $('#body-usage').attr('style', 'display: none;');
    $('#body-builtinroles').attr('style', 'display: none;');
    $('#body-permissions').attr('style', 'display: none;');
    $('#body-builtinrole').attr('style', 'display: none;');
    $('#body-policyevaluator').attr('style', 'display: none;');
    if (window.location.pathname == "/") {
        $('#nav-general-dashboard').addClass('active');
        $('#body-dashboard').attr('style', '');
        loadDashboardCharts();
    } else if (window.location.pathname.startsWith("/usage")) {
        $('#nav-general-usage').addClass('active');
        $('#body-usage').attr('style', '');
    } else if (window.location.pathname.startsWith("/builtinroles/")) {
        $('#nav-general-builtinrole').addClass('active');
        $('#body-builtinrole').attr('style', '');
    } else if (window.location.pathname.startsWith("/builtinroles")) {
        $('#nav-general-builtinroles').addClass('active');
        $('#body-builtinroles').attr('style', '');
    } else if (window.location.pathname.startsWith("/policyevaluator")) {
        $('#nav-general-policyevaluator').addClass('active');
        $('#body-policyevaluator').attr('style', '');
    } else if (window.location.pathname.startsWith("/iam") || window.location.pathname.startsWith("/api")) {
        $('#body-permissions').attr('style', '');
    } else {
        // TODO
    }

    if (window.location.pathname.startsWith("/iam/")) {
        $('.display-iam').attr('style', '');
        $('.display-api').attr('style', 'display: none;');
    } else if (window.location.pathname.startsWith("/api/")) {
        $('.display-iam').attr('style', 'display: none;');
        $('.display-api').attr('style', '');
    }

    if (service) {
        if (!service['displayName'] || service['displayName'] == "") {
            $('.servicename').html(service['name']);
        } else {
            $('.servicename').html(service['displayName']);
        }

        $('.iam-link').click(() => {
            window.location.pathname = window.location.pathname.replace("/api/", "/iam/");
        });
        $('.api-link').click(() => {
            window.location.pathname = window.location.pathname.replace("/iam/", "/api/");
        });

        let operations = service['operations'];
        for (let resource_type of service['resourceTypes']) {
            for (let operation of resource_type['operations']) {
                operation['resourceType'] = resource_type['name'];
                operations.push(operation);
            }
        }

        let actions_table_content = '';
        let iam_count = 0;
        for (let operation of operations) {
            var operationname_parts = operation['name'].split("/");

            let displayName = operation['displayName'].split(". ")[0];
            if (displayName.endsWith(".")) {
                displayName = displayName.substring(0, displayName.length - 1);
            }

            let description = "";
            if (operation['description']) {
                description = operation['description'].split(". ")[0];
                if (!description.endsWith(".")) {
                    description += ".";
                }
            }

            let origins = [];
            if (operation['origin']) {
                origins = operation['origin'].split(",");
                for (let i = 0; i < origins.length; i++) {
                    origins[i] = origins[i][0].toUpperCase() + origins[i].substr(1);
                }
            }

            actions_table_content += '<tr id="' + operation['name'] + '">\
            <td class="tx-medium"><span class="tx-color-03">' + operationname_parts.shift() + '/</span>' + operationname_parts.join("/") + (operation['isDataAction'] ? ' <span class="badge badge-primary">data action</span>' : "") + '</td>\
            <td class="tx-normal">' + displayName + '</td>\
            <td class="tx-normal">' + description + '</td>\
            <td class="tx-medium">' + origins.join(", ") + '</td>\
        </tr>';

            iam_count += 1;
        }
        $('.iam-count').html(iam_count);
        $('#actions-table tbody').append(actions_table_content);

        // api
        let method_table_content = '';
        let api_count = 0;
        for (let operation of operations) {
            var operationname_parts = operation['name'].split("/");

            let displayName = operation['displayName'].split(". ")[0];
            if (displayName.endsWith(".")) {
                displayName = displayName.substring(0, displayName.length - 1);
            }

            let description = "";
            if (operation['description']) {
                description = operation['description'].split(". ")[0];
                if (!description.endsWith(".")) {
                    description += ".";
                }
            }

            let origins = [];
            if (operation['origin']) {
                origins = operation['origin'].split(",");
                for (let i = 0; i < origins.length; i++) {
                    origins[i] = origins[i][0].toUpperCase() + origins[i].substr(1);
                }
            }

            method_table_content += '<tr id="' + operation['name'] + '">\
            <td class="tx-medium"><span class="tx-color-03">' + operationname_parts.shift() + '/</span>' + operationname_parts.join("/") + (operation['isDataAction'] ? ' <span class="badge badge-primary">data action</span>' : "") + '</td>\
            <td class="tx-normal">' + displayName + '</td>\
            <td class="tx-normal">' + description + '</td>\
            <td class="tx-medium">' + origins.join(", ") + '</td>\
        </tr>';

            api_count += 1;
        }

        $('.api-count').html(api_count.toString());
        $('#methods-table tbody').append(method_table_content);
    }

    // built-in roles
    let builtinroles_table_content = '';
    let builtinroles_data = await fetch('https://raw.githubusercontent.com/iann0036/iam-dataset/main/azure/built-in-roles.json');
    let builtinroles = await builtinroles_data.json();

    builtinroles['roles'].sort(function (a, b) {
        if (a['name'] < b['name']) {
            return -1;
        }
        return 1;
    });

    let deprecated_policy_count = 0;
    for (let builtinrole of builtinroles['roles']) {
        if (builtinrole['deprecated']) {
            deprecated_policy_count += 1;
        }

        builtinroles_table_content += '<tr>\
            <td class="tx-medium"><a href="/builtinroles/' + builtinrole['name'] + '">' + builtinrole['name'] + "</a>" + (builtinrole['permittedActions'].length == 0 && builtinrole['permittedDataActions'].length == 0 ? ' <span class="badge badge-secondary">empty</span>' : '') + '</td>\
            <td class="tx-normal">' + builtinrole['description'] + '</td>\
            <td class="tx-normal">' + builtinrole['permittedActions'].length + '</td>\
            <td class="tx-normal">' + builtinrole['permittedDataActions'].length + '</td>\
        </tr>';

        if (window.location.pathname.startsWith("/builtinroles/") && encodeURIComponent(builtinrole['name']).toLowerCase() == window.location.pathname.replace("/builtinroles/", "").toLowerCase()) {
            $('.builtinroleraw').html(Prism.highlight(JSON.stringify(builtinrole['rawPermissions'], null, 4), Prism.languages.javascript, 'javascript'));
            $('.builtinrolename').html(builtinrole['name']);
            processEffective(builtinrole['rawPermissions'], '#effectivepolicy-table', services);
            $('#builtinrole-json-link').attr('href', 'https://raw.githubusercontent.com/iann0036/iam-dataset/main/azure/built-in-roles.json');
        }
    }

    $('#builtinroles-table tbody').append(builtinroles_table_content);

    $('.active-builtinroles-count').html(builtinroles['roles'].length - deprecated_policy_count);
    $('.deprecated-builtinroles-count').html(deprecated_policy_count);

    $('[data-toggle="tooltip"]').tooltip();

    // Total counts
    function numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    total_ops = 0;
    for (let serviceitem of services) {
        for (let resource_type of serviceitem['resourceTypes']) {
            total_ops += resource_type['operations'].length;
        }
    }
    $('.total-actions').html(numberWithCommas(total_ops));
    $('.total-apimethods').html(numberWithCommas(total_ops));
    $('.total-builtinroles').html(numberWithCommas(builtinroles['roles'].length));

    // scroll to hash
    if (window.location.hash != "") {
        try {
            $('.content-body').scrollTop($(window.location.hash).offset().top - $('.content-header').height() + 1);
        } catch (e) { }
    }

    // policy evaluator
    if (window.location.pathname.startsWith("/policyevaluator")) {
        $('.custompolicy').bind('input propertychange', function () {
            clearTimeout(custom_policy_timer);
            custom_policy_timer = setTimeout(function () {
                try {
                    var custompolicy = JSON.parse($('.custompolicy').html());

                    processEffective([{
                        'actions': custompolicy['Actions'],
                        'notActions': custompolicy['NotActions'],
                        'dataActions': custompolicy['DataActions'],
                        'notDataActions': custompolicy['NotDataActions']
                    }], '#customeffectivepolicy-table', services);
                } catch(err) {}
            }, 800);
        });
    }
}

processReferencePage();
